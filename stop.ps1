$ErrorActionPreference = "SilentlyContinue"
$AppRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BootPath = (Join-Path $AppRoot "boot.cjs").Replace("\", "\\")
$Processes = Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -and $_.CommandLine.Replace("\", "\\").Contains($BootPath)
}
foreach ($Process in $Processes) {
  Stop-Process -Id $Process.ProcessId -Force
}
Write-Host "AI Canvas App stopped."
