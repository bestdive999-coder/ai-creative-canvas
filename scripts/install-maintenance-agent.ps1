$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$AppRoot = Split-Path -Parent $PSScriptRoot
$TaskName = "EcommerceAI-MaintenanceAgent"
$Starter = Join-Path $PSScriptRoot "start-maintenance-agent.ps1"
$IntranetDir = Join-Path $AppRoot "runtime\intranet"
$TokenPath = Join-Path $IntranetDir "maintenance-token.txt"

function Test-IsAdmin {
  try {
    $Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $Principal = New-Object Security.Principal.WindowsPrincipal($Identity)
    return $Principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  } catch {
    return $false
  }
}

if (-not (Test-IsAdmin)) {
  throw "Please run this script as administrator."
}
if (-not (Test-Path -LiteralPath $Starter)) {
  throw "Missing maintenance agent starter: $Starter"
}

New-Item -ItemType Directory -Force -Path $IntranetDir | Out-Null
if (-not (Test-Path -LiteralPath $TokenPath)) {
  $Bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($Bytes)
  $Token = -join ($Bytes | ForEach-Object { $_.ToString("x2") })
  Set-Content -LiteralPath $TokenPath -Value $Token -Encoding ASCII
}

$Command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$Starter`""
schtasks.exe /Create /SC ONLOGON /TN $TaskName /TR $Command /RL HIGHEST /F | Out-Host
schtasks.exe /Run /TN $TaskName | Out-Host

Write-Output ""
Write-Output "Maintenance Agent installed."
Write-Output "Task: $TaskName"
Write-Output "URL: http://127.0.0.1:5199"
Write-Output "Token: $TokenPath"
