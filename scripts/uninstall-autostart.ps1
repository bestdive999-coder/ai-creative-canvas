param(
  [ValidateSet("employee", "admin", "both")]
  [string]$Target = "both"
)

$ErrorActionPreference = "Continue"

function Remove-Task($Name) {
  schtasks.exe /Delete /TN $Name /F | Out-Host
}

if ($Target -eq "employee" -or $Target -eq "both") {
  Remove-Task "EcommerceAI-Main"
}

if ($Target -eq "admin" -or $Target -eq "both") {
  Remove-Task "EcommerceAI-Admin"
}

if ($Target -eq "both") {
  Remove-Task "EcommerceAI-Guardian"
}

Write-Host "开机自启动已卸载：$Target"
