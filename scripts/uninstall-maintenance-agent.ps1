$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$TaskName = "EcommerceAI-MaintenanceAgent"
$AgentPort = 5199

try {
  schtasks.exe /Delete /TN $TaskName /F | Out-Host
} catch {
}

$ProcessIds = @()
try {
  Get-NetTCPConnection -LocalPort $AgentPort -ErrorAction Stop | ForEach-Object {
    if ($_.OwningProcess -and $_.OwningProcess -gt 0) { $ProcessIds += [int]$_.OwningProcess }
  }
} catch {
}

$ProcessIds | Sort-Object -Unique | ForEach-Object {
  try { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } catch {}
}

Write-Output "Maintenance Agent uninstalled."
