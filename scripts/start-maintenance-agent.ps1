$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$AppRoot = Split-Path -Parent $PSScriptRoot
$RuntimeDir = Join-Path $AppRoot "runtime"
$LogDir = Join-Path $RuntimeDir "logs"
$NodeLocal = Join-Path $AppRoot "runtime\node\node.exe"
$AgentPort = 5199

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
  throw "Node.js 18+ was not found."
}

function Stop-Port($Port) {
  $ProcessIds = @()
  try {
    Get-NetTCPConnection -LocalPort $Port -ErrorAction Stop | ForEach-Object {
      if ($_.OwningProcess -and $_.OwningProcess -gt 0) { $ProcessIds += [int]$_.OwningProcess }
    }
  } catch {
    try {
      & netstat -ano -p tcp 2>$null | Select-String ":$Port\s" | ForEach-Object {
        $Parts = ($_.ToString().Trim() -split "\s+")
        if ($Parts.Length -ge 5) { $ProcessIds += [int]$Parts[$Parts.Length - 1] }
      }
    } catch {
    }
  }
  $ProcessIds | Sort-Object -Unique | ForEach-Object {
    try { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } catch {}
  }
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Node = Find-Node
$Agent = Join-Path $AppRoot "maintenance-agent.js"
if (-not (Test-Path -LiteralPath $Agent)) {
  throw "maintenance-agent.js not found: $Agent"
}

Stop-Port $AgentPort
$env:ECOMMERCE_CANVAS_APP_ROOT = $AppRoot
$env:ECOM_MAINTENANCE_HOST = "127.0.0.1"
$env:ECOM_MAINTENANCE_PORT = "$AgentPort"

$OutLog = Join-Path $LogDir "maintenance-agent.out.log"
$ErrLog = Join-Path $LogDir "maintenance-agent.err.log"
Remove-Item -LiteralPath $OutLog,$ErrLog -Force -ErrorAction SilentlyContinue

$Process = Start-Process -FilePath $Node `
  -ArgumentList @("`"$Agent`"") `
  -WorkingDirectory $AppRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $OutLog `
  -RedirectStandardError $ErrLog `
  -PassThru

Write-Output "Maintenance Agent PID: $($Process.Id)"
Write-Output "Maintenance Agent URL: http://127.0.0.1:$AgentPort"
