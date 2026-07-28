param(
  [ValidateSet("employee", "admin", "both")]
  [string]$Target = "both"
)

$ErrorActionPreference = "Stop"
$AppRoot = Split-Path -Parent $PSScriptRoot
$Node = Join-Path $AppRoot "runtime\node\node.exe"
if (!(Test-Path $Node)) { $Node = "node" }

function Install-Task($Name, $Script) {
  $ScriptPath = Join-Path $AppRoot $Script
  if ($ScriptPath.EndsWith(".bat")) {
    $Command = '"' + $ScriptPath + '"'
  } else {
    $Command = '"' + $Node + '" "' + $ScriptPath + '"'
  }
  schtasks.exe /Create /SC ONLOGON /TN $Name /TR $Command /F | Out-Host
}

if ($Target -eq "both") {
  Install-Task "EcommerceAI-Guardian" "Start-Unattended-Guardian.bat"
}

if ($Target -eq "employee") {
  Install-Task "EcommerceAI-Main" "server.js"
}

if ($Target -eq "admin") {
  Install-Task "EcommerceAI-Admin" "admin-server.js"
}

Write-Host "开机自启动已安装：$Target"
