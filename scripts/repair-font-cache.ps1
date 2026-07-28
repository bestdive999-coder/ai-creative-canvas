$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$AppRoot = Split-Path -Parent $PSScriptRoot

function Test-IsAdmin {
  try {
    $Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $Principal = New-Object Security.Principal.WindowsPrincipal($Identity)
    return $Principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  } catch {
    return $false
  }
}

function Start-MaintenanceAgentReload {
  $Starter = Join-Path $AppRoot "scripts\start-maintenance-agent.ps1"
  if (-not (Test-Path -LiteralPath $Starter)) { return }
  try {
    $Command = "Start-Sleep -Seconds 1; powershell.exe -NoProfile -ExecutionPolicy Bypass -File '$($Starter.Replace("'", "''"))'"
    Start-Process -FilePath "powershell.exe" `
      -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $Command) `
      -WorkingDirectory $AppRoot `
      -WindowStyle Hidden | Out-Null
    Write-Output "Maintenance Agent reload scheduled."
  } catch {
    Write-Output "Maintenance Agent reload warning: $($_.Exception.Message)"
  }
}

if (-not (Test-IsAdmin)) {
  throw "Please run font cache repair as administrator."
}

Write-Output "Stopping Windows Font Cache service..."
try {
  Stop-Service -Name "FontCache" -Force -ErrorAction SilentlyContinue
} catch {
  Write-Output "FontCache stop warning: $($_.Exception.Message)"
}

$cacheDirs = @(
  (Join-Path $env:WINDIR "ServiceProfiles\LocalService\AppData\Local\FontCache"),
  (Join-Path $env:LOCALAPPDATA "FontCache")
)

foreach ($dir in $cacheDirs) {
  if (Test-Path -LiteralPath $dir) {
    Write-Output "Clearing font cache: $dir"
    Get-ChildItem -LiteralPath $dir -Force -ErrorAction SilentlyContinue | ForEach-Object {
      try {
        Remove-Item -LiteralPath $_.FullName -Force -Recurse -ErrorAction SilentlyContinue
      } catch {
      }
    }
  }
}

Write-Output "Starting Windows Font Cache service..."
try {
  Start-Service -Name "FontCache" -ErrorAction SilentlyContinue
} catch {
  Write-Output "FontCache start warning: $($_.Exception.Message)"
}

Write-Output "Font cache repair completed. Restart Windows if system UI text is still shown as squares."
Start-MaintenanceAgentReload
