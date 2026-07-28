param(
  [ValidateSet("appliance")]
  [string]$Mode = "appliance",
  [int]$IntervalSeconds = 20,
  [int]$FailureThreshold = 3,
  [int]$RestartCooldownSeconds = 120,
  [int]$MaxLogKb = 1024,
  [switch]$ForcePortKill,
  [switch]$Once
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$AppRoot = Split-Path -Parent $PSScriptRoot
$RuntimeDir = Join-Path $AppRoot "runtime"
$LogDir = Join-Path $RuntimeDir "logs"
$PidDir = Join-Path $RuntimeDir "pids"
$NodeLocal = Join-Path $AppRoot "runtime\node\node.exe"
$WatchdogLog = Join-Path $LogDir "watchdog.log"
$ServiceState = @{}

function Ensure-Dirs {
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  New-Item -ItemType Directory -Force -Path $PidDir | Out-Null
}

function Rotate-WatchdogLog {
  if (-not (Test-Path -LiteralPath $WatchdogLog)) { return }
  $MaxBytes = [Math]::Max(128, $MaxLogKb) * 1024
  $Item = Get-Item -LiteralPath $WatchdogLog -ErrorAction SilentlyContinue
  if (-not $Item -or $Item.Length -lt $MaxBytes) { return }
  $Archive = Join-Path $LogDir "watchdog.1.log"
  Remove-Item -LiteralPath $Archive -Force -ErrorAction SilentlyContinue
  Move-Item -LiteralPath $WatchdogLog -Destination $Archive -Force
}

function Write-WatchdogLog($Text) {
  Ensure-Dirs
  Rotate-WatchdogLog
  $Line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Text
  Add-Content -LiteralPath $WatchdogLog -Value $Line -Encoding UTF8
  Write-Host $Line
}

function New-WatchdogMutex {
  $Sha1 = [System.Security.Cryptography.SHA1]::Create()
  $Bytes = [System.Text.Encoding]::UTF8.GetBytes("$Mode|$AppRoot")
  $Hash = ([BitConverter]::ToString($Sha1.ComputeHash($Bytes))).Replace("-", "").Substring(0, 16)
  return New-Object System.Threading.Mutex($false, "Global\EcommerceAIWatchdog-$Hash")
}

function Test-Node($Path) {
  if (-not $Path) { return $false }
  try {
    & $Path -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)" 2>$null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Find-Node {
  if (Test-Node $NodeLocal) { return $NodeLocal }
  $SystemNode = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($SystemNode -and (Test-Node $SystemNode.Source)) { return $SystemNode.Source }
  throw "Node.js 18+ was not found. Use the full package with runtime\node\node.exe."
}

function Test-Url($Url) {
  try {
    $Response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 3
    return $Response.StatusCode -ge 200 -and $Response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Get-ServiceState($Name) {
  if (-not $ServiceState.ContainsKey($Name)) {
    $ServiceState[$Name] = [pscustomobject]@{
      Failures = 0
      WasHealthy = $false
      LastRestartAt = Get-Date "2000-01-01"
    }
  }
  return $ServiceState[$Name]
}

function Get-PidFile($Name) {
  return Join-Path $PidDir "$Name.pid"
}

function Get-ListenerPids($Port) {
  $ProcessIds = @()
  try {
    $Connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
    foreach ($Connection in $Connections) {
      if ($Connection.OwningProcess -and $Connection.OwningProcess -gt 0) {
        $ProcessIds += [int]$Connection.OwningProcess
      }
    }
  } catch {
    try {
      $Lines = & netstat -ano -p tcp 2>$null | Select-String ":$Port\s+.*LISTENING"
      foreach ($Line in $Lines) {
        $Parts = ($Line.ToString().Trim() -split "\s+")
        if ($Parts.Length -ge 5) { $ProcessIds += [int]$Parts[$Parts.Length - 1] }
      }
    } catch {}
  }
  return @($ProcessIds | Where-Object { $_ -gt 0 } | Sort-Object -Unique)
}

function Get-ProcessCommandLine($ProcessId) {
  try {
    $Process = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction Stop
    return [string]$Process.CommandLine
  } catch {
    return ""
  }
}

function Test-OwnedProcess($ProcessId, $ScriptName) {
  if (-not $ProcessId -or $ProcessId -le 0) { return $false }
  $CommandLine = Get-ProcessCommandLine $ProcessId
  if (-not $CommandLine) { return $false }
  $RootPattern = [regex]::Escape($AppRoot)
  $ScriptPattern = [regex]::Escape($ScriptName)
  return ($CommandLine -match $RootPattern -and $CommandLine -match $ScriptPattern)
}

function Stop-OwnedService($Name, $ScriptName, $Port) {
  $Stopped = $false
  $PidFile = Get-PidFile $Name
  if (Test-Path -LiteralPath $PidFile) {
    $PidText = (Get-Content -LiteralPath $PidFile -Raw -ErrorAction SilentlyContinue).Trim()
    $OwnedProcessId = 0
    if ([int]::TryParse($PidText, [ref]$OwnedProcessId) -and (Test-OwnedProcess $OwnedProcessId $ScriptName)) {
      Write-WatchdogLog "$Name stopping owned PID $OwnedProcessId"
      Stop-Process -Id $OwnedProcessId -Force -ErrorAction SilentlyContinue
      $Stopped = $true
    }
  }

  foreach ($ListenerProcessId in (Get-ListenerPids $Port)) {
    if (Test-OwnedProcess $ListenerProcessId $ScriptName) {
      Write-WatchdogLog "$Name stopping owned listener PID $ListenerProcessId on port $Port"
      Stop-Process -Id $ListenerProcessId -Force -ErrorAction SilentlyContinue
      $Stopped = $true
      continue
    }

    if ($ForcePortKill) {
      Write-WatchdogLog "$Name force stopping non-owned listener PID $ListenerProcessId on port $Port"
      Stop-Process -Id $ListenerProcessId -Force -ErrorAction SilentlyContinue
      $Stopped = $true
    } else {
      Write-WatchdogLog "$Name found non-owned listener PID $ListenerProcessId on port $Port; skip killing it"
    }
  }

  if ($Stopped) { Start-Sleep -Seconds 1 }
}

function Start-NodeService($Node, $Name, $Script, $Port, $EnvVars) {
  $OutLog = Join-Path $LogDir "$Name.out.log"
  $ErrLog = Join-Path $LogDir "$Name.err.log"
  $PidFile = Get-PidFile $Name

  $PreviousEnv = @{}
  foreach ($Key in $EnvVars.Keys) {
    $PreviousEnv[$Key] = [Environment]::GetEnvironmentVariable($Key, "Process")
    [Environment]::SetEnvironmentVariable($Key, [string]$EnvVars[$Key], "Process")
  }

  try {
    Write-WatchdogLog "Starting $Name on port $Port"
    $Process = Start-Process -FilePath $Node `
      -ArgumentList @($Script) `
      -WorkingDirectory $AppRoot `
      -WindowStyle Hidden `
      -RedirectStandardOutput $OutLog `
      -RedirectStandardError $ErrLog `
      -PassThru
    Set-Content -LiteralPath $PidFile -Value ([string]$Process.Id) -Encoding ASCII
    Write-WatchdogLog "$Name PID $($Process.Id)"
  } finally {
    foreach ($Key in $PreviousEnv.Keys) {
      [Environment]::SetEnvironmentVariable($Key, $PreviousEnv[$Key], "Process")
    }
  }
}

function Wait-ServiceReady($Name, $HealthUrl) {
  for ($i = 1; $i -le 30; $i += 1) {
    Start-Sleep -Milliseconds 700
    if (Test-Url $HealthUrl) {
      Write-WatchdogLog "$Name recovered"
      return $true
    }
  }
  Write-WatchdogLog "$Name still unhealthy after restart. Check $LogDir."
  return $false
}

function Ensure-Service($Node, $Name, $ScriptName, $Port, $HealthUrl, $EnvVars) {
  $State = Get-ServiceState $Name
  if (Test-Url $HealthUrl) {
    if (-not $State.WasHealthy) {
      Write-WatchdogLog "$Name healthy: $HealthUrl"
    }
    $State.Failures = 0
    $State.WasHealthy = $true
    return
  }

  $State.WasHealthy = $false
  $State.Failures += 1
  $Listeners = Get-ListenerPids $Port
  $Threshold = [Math]::Max(1, $FailureThreshold)
  $ShouldStartImmediately = $Listeners.Count -eq 0

  Write-WatchdogLog "$Name health check failed $($State.Failures)/$Threshold; listeners=$($Listeners.Count)"

  if (-not $ShouldStartImmediately -and $State.Failures -lt $Threshold) {
    return
  }

  $Now = Get-Date
  $SecondsSinceRestart = ($Now - $State.LastRestartAt).TotalSeconds
  if ($SecondsSinceRestart -lt $RestartCooldownSeconds) {
    $Left = [Math]::Ceiling($RestartCooldownSeconds - $SecondsSinceRestart)
    Write-WatchdogLog "$Name restart cooldown active; wait ${Left}s"
    return
  }

  $State.LastRestartAt = $Now
  Stop-OwnedService $Name $ScriptName $Port

  if ((Get-ListenerPids $Port).Count -gt 0 -and -not $ForcePortKill) {
    Write-WatchdogLog "$Name port $Port is still occupied by another process. Not starting duplicate service."
    return
  }

  Start-NodeService $Node $Name (Join-Path $AppRoot $ScriptName) $Port $EnvVars
  if (Wait-ServiceReady $Name $HealthUrl) {
    $State.Failures = 0
    $State.WasHealthy = $true
  }
}

function Test-RuntimeWriteAccess {
  Ensure-Dirs
  $Path = Join-Path $RuntimeDir "watchdog-heartbeat.txt"
  Set-Content -LiteralPath $Path -Value (Get-Date -Format "s") -Encoding UTF8
}

function Invoke-WatchdogPass {
  $Node = Find-Node
  Test-RuntimeWriteAccess

  if ($Mode -eq "appliance") {
    Ensure-Service $Node "employee" "server.js" 5173 "http://127.0.0.1:5173/api/health" @{
      PORT = "5173"
      ECOM_EMPLOYEE_HOST = "0.0.0.0"
      ECOMMERCE_CANVAS_APP_ROOT = $AppRoot
    }
    Ensure-Service $Node "admin" "admin-server.js" 5188 "http://127.0.0.1:5188/" @{
      ADMIN_PORT = "5188"
      PORT = "5173"
      ECOM_ADMIN_HOST = "0.0.0.0"
      ECOMMERCE_CANVAS_APP_ROOT = $AppRoot
    }
    return
  }
}

Ensure-Dirs
$Mutex = New-WatchdogMutex
if (-not $Mutex.WaitOne(0)) {
  Write-WatchdogLog "Another watchdog for this mode and app root is already running. Exit."
  exit 0
}

try {
  Write-WatchdogLog "Stable watchdog started. mode=$Mode interval=${IntervalSeconds}s threshold=$FailureThreshold cooldown=${RestartCooldownSeconds}s once=$Once appRoot=$AppRoot"

  do {
    try {
      Invoke-WatchdogPass
    } catch {
      Write-WatchdogLog "ERROR: $($_.Exception.Message)"
    }

    if ($Once) { break }
    Start-Sleep -Seconds ([Math]::Max(5, $IntervalSeconds))
  } while ($true)
} finally {
  $Mutex.ReleaseMutex() | Out-Null
  $Mutex.Dispose()
}
