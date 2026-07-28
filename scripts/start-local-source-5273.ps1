param(
  [int]$EmployeePort = 5273,
  [int]$AdminPort = 5288,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$AppRoot = Split-Path -Parent $PSScriptRoot
$Node = Join-Path $AppRoot "runtime\node\node.exe"
$Server = Join-Path $AppRoot "server.js"
$AdminServer = Join-Path $AppRoot "admin-server.js"
$LogDir = Join-Path $AppRoot "runtime\logs"
$EmployeeUrl = "http://127.0.0.1:$EmployeePort/"
$AdminUrl = "http://127.0.0.1:$AdminPort/"
$ConfigUrl = "http://127.0.0.1:$EmployeePort/api/client/config"

function Write-Step($Text) {
  Write-Output ""
  Write-Output "== $Text =="
}

function Stop-Port($Port) {
  $ProcessIds = @()
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
    } catch {}
  }

  $ProcessIds = $ProcessIds | Sort-Object -Unique
  foreach ($ProcessId in $ProcessIds) {
    try {
      $Process = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
      Write-Output "Stop old process on port $Port, PID $ProcessId"
      if ($Process -and $Process.CommandLine) {
        Write-Output "Old command: $($Process.CommandLine)"
      }
      Stop-Process -Id $ProcessId -Force -ErrorAction Stop
    } catch {
      Write-Output "Could not stop PID ${ProcessId}: $($_.Exception.Message)"
    }
  }
}

function Wait-Url($Url, $Name) {
  for ($i = 1; $i -le 30; $i += 1) {
    try {
      $Response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 2
      if ($Response.StatusCode -ge 200 -and $Response.StatusCode -lt 500) {
        Write-Output "$Name ready: $Url"
        return $true
      }
    } catch {}
    Start-Sleep -Milliseconds 700
  }
  return $false
}

function Start-NodeService($Script, $Name, $EnvVars) {
  $OutLog = Join-Path $LogDir "$Name-5273-source.out.log"
  $ErrLog = Join-Path $LogDir "$Name-5273-source.err.log"
  Remove-Item -LiteralPath $OutLog,$ErrLog -Force -ErrorAction SilentlyContinue

  $Previous = @{}
  foreach ($Key in $EnvVars.Keys) {
    $Previous[$Key] = [Environment]::GetEnvironmentVariable($Key, "Process")
    [Environment]::SetEnvironmentVariable($Key, [string]$EnvVars[$Key], "Process")
  }

  try {
    $Process = Start-Process -FilePath $Node `
      -ArgumentList @($Script) `
      -WorkingDirectory $AppRoot `
      -WindowStyle Hidden `
      -RedirectStandardOutput $OutLog `
      -RedirectStandardError $ErrLog `
      -PassThru
    Write-Output "$Name PID: $($Process.Id)"
  } finally {
    foreach ($Key in $Previous.Keys) {
      [Environment]::SetEnvironmentVariable($Key, $Previous[$Key], "Process")
    }
  }
}

if (-not (Test-Path -LiteralPath $Node)) {
  throw "Missing portable Node: $Node"
}
if (-not (Test-Path -LiteralPath $Server)) {
  throw "Missing source server.js: $Server"
}
if (-not (Test-Path -LiteralPath $AdminServer)) {
  throw "Missing source admin-server.js: $AdminServer"
}

Write-Step "Start local source app"
Write-Output "AppRoot: $AppRoot"
Write-Output "Employee URL: $EmployeeUrl"
Write-Output "Admin URL: $AdminUrl"
Write-Output "This launcher uses server.js/admin-server.js only. It never uses boot.cjs/app.dat."

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

Write-Step "Stop old ports"
Stop-Port $EmployeePort
Stop-Port $AdminPort
Start-Sleep -Milliseconds 800

Write-Step "Start services"
Start-NodeService $Server "employee" @{
  PORT = $EmployeePort
  ECOM_EMPLOYEE_HOST = "127.0.0.1"
  ECOMMERCE_CANVAS_APP_ROOT = $AppRoot
}
Start-NodeService $AdminServer "admin" @{
  ADMIN_PORT = $AdminPort
  PORT = $EmployeePort
  ECOM_ADMIN_HOST = "127.0.0.1"
  ECOMMERCE_CANVAS_APP_ROOT = $AppRoot
}

Write-Step "Health check"
if (-not (Wait-Url $EmployeeUrl "Employee")) {
  Get-Content -LiteralPath (Join-Path $LogDir "employee-5273-source.err.log") -Tail 80 -ErrorAction SilentlyContinue
  throw "Employee app failed to start."
}
if (-not (Wait-Url $AdminUrl "Admin")) {
  Get-Content -LiteralPath (Join-Path $LogDir "admin-5273-source.err.log") -Tail 80 -ErrorAction SilentlyContinue
  throw "Admin app failed to start."
}

try {
  $Config = Invoke-RestMethod -Uri $ConfigUrl -TimeoutSec 5
  $PrimaryOk = [bool]$Config.ai.providers.imageservice.configured
  $SecondaryOk = [bool]$Config.ai.providers.primaryimage.configured
  Write-Output "Config API: OK"
  Write-Output "图片服务 Key: $(if ($PrimaryOk) { 'configured' } else { 'missing' })"
  Write-Output "图片服务备用 Key: $(if ($SecondaryOk) { 'configured' } else { 'missing' })"
  if (-not $PrimaryOk -and -not $SecondaryOk) {
    throw "Config API is reachable, but AI keys are missing. Check runtime\intranet\config.json."
  }
} catch {
  throw "Config API check failed: $($_.Exception.Message)"
}

Write-Step "Started"
Write-Output "Employee URL: $EmployeeUrl"
Write-Output "Admin URL: $AdminUrl"

if (-not $NoBrowser) {
  Start-Process ($EmployeeUrl + "?canvas-beta=" + [DateTimeOffset]::Now.ToUnixTimeMilliseconds())
}
