param(
  [string]$BackupPath = "",
  [switch]$NoRestart
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$AppRoot = Split-Path -Parent $PSScriptRoot
$RuntimeDir = Join-Path $AppRoot "runtime"
$LogDir = Join-Path $RuntimeDir "logs"
$BackupRoot = Join-Path $RuntimeDir "backups"
$LogPath = Join-Path $LogDir "update.log"

function Ensure-Dirs {
  New-Item -ItemType Directory -Force -Path $RuntimeDir,$LogDir,$BackupRoot | Out-Null
}

function Write-RollbackLog($Text) {
  Ensure-Dirs
  $Line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Text
  Add-Content -LiteralPath $LogPath -Value $Line -Encoding UTF8
  Write-Host $Line
}

function Test-Url($Url) {
  try {
    $Response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 4
    return $Response.StatusCode -ge 200 -and $Response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Assert-AppRoot {
  if (-not (Test-Path -LiteralPath (Join-Path $AppRoot "scripts"))) {
    throw "Invalid app root: $AppRoot"
  }
}

function Resolve-BackupPath {
  if ($BackupPath) {
    $Resolved = Resolve-Path -LiteralPath $BackupPath -ErrorAction Stop
    return $Resolved.Path
  }

  $Latest = Get-ChildItem -LiteralPath $BackupRoot -Directory -Filter "app-*" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $Latest) {
    throw "No rollback backup found at $BackupRoot"
  }
  return $Latest.FullName
}

function Stop-AppProcesses {
  $RootPattern = [regex]::Escape($AppRoot)
  $Targets = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and $_.CommandLine -match $RootPattern -and (
      ($_.Name -eq "node.exe" -and ($_.CommandLine -match "server\.js" -or $_.CommandLine -match "admin-server\.js")) -or
      ($_.Name -match "^(powershell|pwsh)\.exe$" -and $_.CommandLine -match "watchdog\.ps1")
    )
  }

  foreach ($Process in $Targets) {
    if ($Process.ProcessId -eq $PID) { continue }
    try {
      Write-RollbackLog "Stopping PID $($Process.ProcessId): $($Process.Name)"
      Stop-Process -Id $Process.ProcessId -Force -ErrorAction Stop
    } catch {
      Write-RollbackLog "Could not stop PID $($Process.ProcessId): $($_.Exception.Message)"
    }
  }
  Start-Sleep -Seconds 2
}

function Invoke-Robocopy($Source, $Destination, $ExtraArgs) {
  $Args = @($Source, $Destination) + $ExtraArgs
  & robocopy.exe @Args | Out-Host
  $Code = $LASTEXITCODE
  if ($Code -ge 8) {
    throw "robocopy failed with exit code $Code"
  }
}

function Start-Guardian {
  if ($NoRestart) {
    Write-RollbackLog "NoRestart enabled; services are not restarted."
    return
  }

  $Watchdog = Join-Path $AppRoot "scripts\watchdog.ps1"
  Write-RollbackLog "Starting stable watchdog."
  Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $Watchdog, "-Mode", "appliance") `
    -WorkingDirectory $AppRoot `
    -WindowStyle Hidden | Out-Null

  for ($i = 1; $i -le 60; $i += 1) {
    Start-Sleep -Seconds 1
    if ((Test-Url "http://127.0.0.1:5173/api/health") -and (Test-Url "http://127.0.0.1:5188/")) {
      Write-RollbackLog "Services recovered after rollback."
      return
    }
  }
  throw "Services did not recover after rollback. Check runtime\logs."
}

Ensure-Dirs
Assert-AppRoot
$Mutex = New-Object System.Threading.Mutex($false, "Global\EcommerceAIUpdate-$([Math]::Abs($AppRoot.GetHashCode()))")
if (-not $Mutex.WaitOne(0)) {
  throw "Another update or rollback task is already running."
}

try {
  $Backup = Resolve-BackupPath
  if (-not (Test-Path -LiteralPath (Join-Path $Backup "server.js"))) {
    throw "Invalid backup folder. Missing server.js at $Backup"
  }
  Write-RollbackLog "Rollback started. backup=$Backup"
  Stop-AppProcesses
  Invoke-Robocopy $Backup $AppRoot @("/E", "/XD", "runtime", "/R:1", "/W:1", "/NFL", "/NDL", "/NP")
  Start-Guardian
  Write-RollbackLog "Rollback completed."
} finally {
  $Mutex.ReleaseMutex() | Out-Null
  $Mutex.Dispose()
}
