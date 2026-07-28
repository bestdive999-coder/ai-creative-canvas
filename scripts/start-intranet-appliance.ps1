param(
  [switch]$InteractiveLaunched,
  [switch]$SkipMaintenanceAgent
)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$ProcessPath = [Environment]::GetEnvironmentVariable("Path", "Process")
if ($ProcessPath) {
  [Environment]::SetEnvironmentVariable("PATH", $null, "Process")
  [Environment]::SetEnvironmentVariable("Path", $ProcessPath, "Process")
}

$AppRoot = Split-Path -Parent $PSScriptRoot
$EmployeePort = 5173
$AdminPort = 5188
$EmployeeUrl = "http://127.0.0.1:$EmployeePort/"
$AdminUrl = "http://127.0.0.1:$AdminPort/"
$RuntimeDir = Join-Path $AppRoot "runtime"
$LogDir = Join-Path $RuntimeDir "logs"
$NodeLocal = Join-Path $AppRoot "runtime\node\node.exe"

function Test-IsAdmin {
  try {
    $Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $Principal = New-Object Security.Principal.WindowsPrincipal($Identity)
    return $Principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  } catch {
    return $false
  }
}

function Start-InteractiveSelf {
  try {
    $Shell = New-Object -ComObject Shell.Application
    $ScriptPath = $PSCommandPath
    $Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`" -InteractiveLaunched"
    $Shell.ShellExecute("powershell.exe", $Arguments, $AppRoot, "open", 0) | Out-Null
    Write-Output "Restarted in desktop user session."
    return $true
  } catch {
    Write-Output "Interactive relaunch failed: $($_.Exception.Message)"
    return $false
  }
}

function Get-PortPids($Ports) {
  $ProcessIds = @()
  foreach ($Port in $Ports) {
    try {
      Get-NetTCPConnection -LocalPort $Port -ErrorAction Stop | ForEach-Object {
        if ($_.OwningProcess -and $_.OwningProcess -gt 0) {
          $ProcessIds += [int]$_.OwningProcess
        }
      }
    } catch {
      try {
        & netstat -ano -p tcp 2>$null | Select-String ":$Port\s" | ForEach-Object {
          $Parts = ($_.ToString().Trim() -split "\s+")
          if ($Parts.Length -ge 5) {
            $ProcessIds += [int]$Parts[$Parts.Length - 1]
          }
        }
      } catch {
      }
    }
  }
  return @($ProcessIds | Sort-Object -Unique)
}

if (-not $InteractiveLaunched -and (Test-IsAdmin) -and $env:ECOM_ENABLE_INTERACTIVE_RELAUNCH -eq "1") {
  $BeforePids = @(Get-PortPids @($EmployeePort, $AdminPort))
  if (Start-InteractiveSelf) {
    for ($i = 1; $i -le 15; $i += 1) {
      Start-Sleep -Seconds 1
      $AfterPids = @(Get-PortPids @($EmployeePort, $AdminPort))
      $Changed = $false
      foreach ($ExistingProcessId in $AfterPids) {
        if ($BeforePids -notcontains $ExistingProcessId) {
          $Changed = $true
        }
      }
      if ($Changed) {
        Write-Output "Desktop user session took over service startup."
        exit 0
      }
    }
    Write-Output "Desktop relaunch did not take over in time; falling back to direct startup."
  }
}

function Write-Step($Text) {
  Write-Output ""
  Write-Output "== $Text =="
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
  throw "Node.js 18+ was not found. Use the full package with runtime\node\node.exe, or install Node.js 18+."
}

function Test-Url($Url) {
  try {
    $Response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 2
    return $Response.StatusCode -ge 200 -and $Response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Stop-Port($Port) {
  $ProcessIds = @()

  try {
    $Connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction Stop
    foreach ($Connection in $Connections) {
      if ($Connection.OwningProcess -and $Connection.OwningProcess -gt 0) {
        $ProcessIds += [int]$Connection.OwningProcess
      }
    }
  } catch {
    try {
      $Lines = & netstat -ano -p tcp 2>$null | Select-String ":$Port\s"
      foreach ($Line in $Lines) {
        $Parts = ($Line.ToString().Trim() -split "\s+")
        if ($Parts.Length -ge 5) {
          $ProcessIds += [int]$Parts[$Parts.Length - 1]
        }
      }
    } catch {
    }
  }

  $ProcessIds = $ProcessIds | Sort-Object -Unique
  foreach ($ProcessId in $ProcessIds) {
    try {
      Write-Output "Stopping old process on port $Port, PID $ProcessId"
      Stop-Process -Id $ProcessId -Force -ErrorAction Stop
    } catch {
      Write-Output "Could not stop PID ${ProcessId}: $($_.Exception.Message)"
    }
  }
}

function Start-NodeScript($Node, $Script, $Name, $EnvVars = @{}) {
  $OutLog = Join-Path $LogDir "$Name.out.log"
  $ErrLog = Join-Path $LogDir "$Name.err.log"
  $QuotedScript = '"' + $Script + '"'
  Remove-Item -LiteralPath $OutLog,$ErrLog -Force -ErrorAction SilentlyContinue

  $PreviousEnv = @{}
  foreach ($Key in $EnvVars.Keys) {
    $PreviousEnv[$Key] = [Environment]::GetEnvironmentVariable($Key, "Process")
    [Environment]::SetEnvironmentVariable($Key, [string]$EnvVars[$Key], "Process")
  }

  try {
    Write-Output "Starting $Name ..."
    $Process = Start-Process -FilePath $Node `
      -ArgumentList @($QuotedScript) `
      -WorkingDirectory $AppRoot `
      -WindowStyle Hidden `
      -RedirectStandardOutput $OutLog `
      -RedirectStandardError $ErrLog `
      -PassThru
    Write-Output "$Name PID: $($Process.Id)"
    Start-Sleep -Milliseconds 900
    $Process.Refresh()
    if ($Process.HasExited) {
      Show-LogTail $ErrLog
      Show-LogTail $OutLog
      throw "$Name exited immediately. See logs in: $LogDir"
    }
  } finally {
    foreach ($Key in $PreviousEnv.Keys) {
      [Environment]::SetEnvironmentVariable($Key, $PreviousEnv[$Key], "Process")
    }
  }
}

function Show-LogTail($Path) {
  if (Test-Path -LiteralPath $Path) {
    Write-Output ""
    Write-Output "--- $Path ---"
    Get-Content -LiteralPath $Path -Tail 80 -ErrorAction SilentlyContinue
  }
}

function Get-LanIp {
  try {
    $Addresses = [System.Net.Dns]::GetHostAddresses($env:COMPUTERNAME)
    foreach ($Address in $Addresses) {
      $Ip = $Address.ToString()
      if ($Address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
          -not $Ip.StartsWith("127.") -and
          -not $Ip.StartsWith("169.254.")) {
        return $Ip
      }
    }
  } catch {
  }
  return $null
}

function Wait-Ready($Url, $Name, $ErrLog) {
  for ($i = 1; $i -le 45; $i += 1) {
    if (Test-Url $Url) {
      Write-Output "$Name ready: $Url"
      return
    }
    Write-Output "Waiting for $Name ... $i/45"
    Start-Sleep -Seconds 1
  }

  Show-LogTail $ErrLog
  throw "$Name failed to start. See logs in: $LogDir"
}

function Start-WatchdogGuardian {
  $Watchdog = Join-Path $PSScriptRoot "watchdog.ps1"
  if (-not (Test-Path -LiteralPath $Watchdog)) {
    Write-Output "Watchdog not found: $Watchdog"
    return
  }

  Write-Step "Start guardian"
  Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $Watchdog, "-Mode", "appliance") `
    -WorkingDirectory $AppRoot `
    -WindowStyle Hidden | Out-Null
  Write-Output "Guardian started. It will restart Employee/Admin if they stop responding."
}

function Start-MaintenanceAgent {
  $Starter = Join-Path $PSScriptRoot "start-maintenance-agent.ps1"
  if (-not (Test-Path -LiteralPath $Starter)) {
    Write-Output "Maintenance starter not found: $Starter"
    return
  }

  Write-Step "Start maintenance agent"
  Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $Starter) `
    -WorkingDirectory $AppRoot `
    -WindowStyle Hidden | Out-Null
  Write-Output "Maintenance agent restart requested."
}

Write-Step "Check runtime"
$Node = Find-Node
Write-Output "App root: $AppRoot"
Write-Output "Node.js: $Node"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

Write-Step "Stop old ports"
Stop-Port $EmployeePort
Stop-Port $AdminPort
Start-Sleep -Seconds 1

Write-Step "Start services"
$env:ECOMMERCE_CANVAS_APP_ROOT = $AppRoot
Start-NodeScript $Node (Join-Path $AppRoot "server.js") "employee" @{
  PORT = $EmployeePort
  ECOM_EMPLOYEE_HOST = "0.0.0.0"
  ECOMMERCE_CANVAS_APP_ROOT = $AppRoot
}
Start-NodeScript $Node (Join-Path $AppRoot "admin-server.js") "admin" @{
  ADMIN_PORT = $AdminPort
  PORT = $EmployeePort
  ECOM_ADMIN_HOST = "0.0.0.0"
  ECOMMERCE_CANVAS_APP_ROOT = $AppRoot
}

Write-Step "Health check"
Wait-Ready $EmployeeUrl "Employee web app" (Join-Path $LogDir "employee.err.log")
Wait-Ready $AdminUrl "Admin console" (Join-Path $LogDir "admin.err.log")
Start-WatchdogGuardian
if (-not $SkipMaintenanceAgent) {
  Start-MaintenanceAgent
} else {
  Write-Output "Maintenance agent restart skipped."
}

Write-Step "Started"
Write-Output "Employee web app: $EmployeeUrl"
Write-Output "Admin console:     $AdminUrl"
$LanIp = Get-LanIp
if ($LanIp) {
  Write-Output "LAN employee URL:  http://$LanIp`:$EmployeePort/"
  Write-Output "LAN admin URL:     http://$LanIp`:$AdminPort/"
}
