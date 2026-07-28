$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $Principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    "`"$PSCommandPath`""
  )
  exit
}

function Assert-ManagedAppRoot([string]$Root) {
  $Resolved = [IO.Path]::GetFullPath($Root).TrimEnd("\")
  $VolumeRoot = [IO.Path]::GetPathRoot($Resolved).TrimEnd("\")
  if ([string]::IsNullOrWhiteSpace($Resolved) -or
      $Resolved -eq $VolumeRoot -or
      $Resolved.Length -lt ($VolumeRoot.Length + 10)) {
    throw "电商 AI 画布安装目录不安全，已拒绝卸载。"
  }

  $RootItem = Get-Item -LiteralPath $Resolved -Force
  if (($RootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "电商 AI 画布安装目录不能是符号链接或目录联接，已拒绝卸载。"
  }

  foreach ($Name in @("server.js", "admin-server.js", "maintenance-agent.js")) {
    if (-not (Test-Path -LiteralPath (Join-Path $Resolved $Name) -PathType Leaf)) {
      throw "电商 AI 画布安装身份校验失败，已拒绝卸载。"
    }
  }
  foreach ($Name in @("public", "admin-public", "scripts")) {
    if (-not (Test-Path -LiteralPath (Join-Path $Resolved $Name) -PathType Container)) {
      throw "电商 AI 画布安装目录校验失败，已拒绝卸载。"
    }
  }
  return $Resolved
}

function ConvertTo-PowerShellLiteral([string]$Value) {
  return "'" + $Value.Replace("'", "''") + "'"
}

$AppRoot = Split-Path -Parent $PSScriptRoot
$ResolvedAppRoot = Assert-ManagedAppRoot $AppRoot
$StatusPath = Join-Path $ResolvedAppRoot "runtime\intranet\uninstall-status.json"
$ChallengePath = Join-Path $ResolvedAppRoot "runtime\intranet\uninstall-local-confirmation.json"

if (-not (Test-Path -LiteralPath $StatusPath -PathType Leaf) -or
    -not (Test-Path -LiteralPath $ChallengePath -PathType Leaf)) {
  throw "当前没有等待本机确认的彻底卸载申请。"
}

$Status = Get-Content -LiteralPath $StatusPath -Raw | ConvertFrom-Json
$Challenge = Get-Content -LiteralPath $ChallengePath -Raw | ConvertFrom-Json
$RequestId = [string]$Challenge.requestId
if ($RequestId -notmatch "^[a-f0-9]{32}$" -or
    [string]$Status.status -ne "awaiting-local-confirmation" -or
    [string]$Status.requestId -ne $RequestId) {
  throw "卸载申请状态不一致，已拒绝执行。"
}

$ExpiresAt = [DateTimeOffset]::Parse([string]$Challenge.expiresAt)
if ($ExpiresAt -le [DateTimeOffset]::Now) {
  throw "卸载确认已经过期，请让超级管理员重新发起。"
}

Write-Host ""
Write-Host "电商 AI 画布彻底卸载确认" -ForegroundColor Red
Write-Host "申请人：$($Challenge.requestedBy)"
Write-Host "到期时间：$($ExpiresAt.LocalDateTime.ToString('yyyy-MM-dd HH:mm:ss'))"
Write-Host ""
Write-Host "确认后将永久删除本机电商 AI 画布代码、数据库、图片、素材、配置、密钥、日志、缓存、备份、服务和自启动项。" -ForegroundColor Yellow
Write-Host "该操作不可恢复。" -ForegroundColor Red
Write-Host ""
Write-Host "一次性确认码：$($Challenge.code)" -ForegroundColor Cyan

$EnteredCode = (Read-Host "请重新输入上方 6 位确认码").Trim()
if ($EnteredCode -ne [string]$Challenge.code) {
  throw "确认码不匹配，已取消。"
}
$Phrase = (Read-Host "请输入：彻底卸载电商 AI 画布").Trim()
if ($Phrase -ne "彻底卸载电商 AI 画布") {
  throw "确认文字不匹配，已取消。"
}

$LatestStatus = Get-Content -LiteralPath $StatusPath -Raw | ConvertFrom-Json
$LatestChallenge = Get-Content -LiteralPath $ChallengePath -Raw | ConvertFrom-Json
if ([string]$LatestStatus.status -ne "awaiting-local-confirmation" -or
    [string]$LatestStatus.requestId -ne $RequestId -or
    [string]$LatestChallenge.requestId -ne $RequestId -or
    [string]$LatestChallenge.code -ne $EnteredCode -or
    [DateTimeOffset]::Parse([string]$LatestChallenge.expiresAt) -le [DateTimeOffset]::Now) {
  throw "卸载申请已取消、过期或被替换，已拒绝执行。"
}

$LauncherDir = Join-Path ([IO.Path]::GetTempPath()) "ecommerce-canvas-full-uninstall-$RequestId"
$LauncherPath = Join-Path $LauncherDir "full-uninstall.ps1"
if (Test-Path -LiteralPath $LauncherDir) {
  Remove-Item -LiteralPath $LauncherDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $LauncherDir | Out-Null

$LauncherTemplate = @'
$ErrorActionPreference = "SilentlyContinue"
$AppRoot = __APP_ROOT__
$LauncherDir = __LAUNCHER_DIR__
$RequestId = "__REQUEST_ID__"
$TaskNames = @(
  "EcommerceAI-Main",
  "EcommerceAI-Admin",
  "EcommerceAI-Guardian",
  "EcommerceAI-MaintenanceAgent"
)

$ResolvedAppRoot = [IO.Path]::GetFullPath($AppRoot).TrimEnd("\")
$VolumeRoot = [IO.Path]::GetPathRoot($ResolvedAppRoot).TrimEnd("\")
if ([string]::IsNullOrWhiteSpace($ResolvedAppRoot) -or
    $ResolvedAppRoot -eq $VolumeRoot -or
    $ResolvedAppRoot.Length -lt ($VolumeRoot.Length + 10)) {
  exit 31
}
$RootItem = Get-Item -LiteralPath $ResolvedAppRoot -Force
if (($RootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
  exit 32
}
foreach ($Name in @("server.js", "admin-server.js", "maintenance-agent.js")) {
  if (-not (Test-Path -LiteralPath (Join-Path $ResolvedAppRoot $Name) -PathType Leaf)) {
    exit 33
  }
}

$AppParent = Split-Path -Parent $ResolvedAppRoot
$UpdateBackupRoot = Join-Path $AppParent "app-update-backups"
$ExportStageRoot = Join-Path $AppParent "app-export-stages"
$UpdateWorkDir = Join-Path ([IO.Path]::GetTempPath()) "ecommerce-ai-worker-updates"
$PackagedRuntimeRoot = Join-Path ([IO.Path]::GetTempPath()) "ecommerce-canvas-app-runtime"
$ExpectedLauncherDir = [IO.Path]::GetFullPath(
  (Join-Path ([IO.Path]::GetTempPath()) "ecommerce-canvas-full-uninstall-$RequestId")
).TrimEnd("\")
if ([IO.Path]::GetFullPath($LauncherDir).TrimEnd("\") -ne $ExpectedLauncherDir) {
  exit 34
}

Start-Sleep -Seconds 3
foreach ($TaskName in $TaskNames) {
  & schtasks.exe /Delete /TN $TaskName /F 2>$null | Out-Null
}

try {
  Get-CimInstance Win32_Process | Where-Object {
    $_.ProcessId -ne $PID -and
    $_.CommandLine -and
    $_.CommandLine.IndexOf($ResolvedAppRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0
  } | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
} catch {}
Start-Sleep -Seconds 2

try {
  $ReparsePoints = @(
    Get-ChildItem -LiteralPath $ResolvedAppRoot -Recurse -Force -Attributes ReparsePoint -ErrorAction Stop |
      Sort-Object { $_.FullName.Length } -Descending
  )
  foreach ($Link in $ReparsePoints) {
    if ($Link.PSIsContainer) {
      & cmd.exe /d /c ('rmdir "' + $Link.FullName.Replace('"', '""') + '"') | Out-Null
    } else {
      Remove-Item -LiteralPath $Link.FullName -Force -ErrorAction Stop
    }
  }
  $RemainingLinks = @(
    Get-ChildItem -LiteralPath $ResolvedAppRoot -Recurse -Force -Attributes ReparsePoint -ErrorAction Stop
  )
  if ($RemainingLinks.Count -gt 0) {
    exit 35
  }
} catch {
  exit 35
}

& attrib.exe -R -S -H (Join-Path $ResolvedAppRoot "*") /S /D 2>$null | Out-Null
& icacls.exe $ResolvedAppRoot /grant "*S-1-5-32-544:(OI)(CI)F" /T /C /Q 2>$null | Out-Null
for ($Attempt = 0; $Attempt -lt 15; $Attempt++) {
  if (-not (Test-Path -LiteralPath $ResolvedAppRoot)) {
    break
  }
  Remove-Item -LiteralPath $ResolvedAppRoot -Recurse -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 800
}

Remove-Item -LiteralPath $UpdateBackupRoot -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $ExportStageRoot -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $UpdateWorkDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $PackagedRuntimeRoot -Recurse -Force -ErrorAction SilentlyContinue
$SelfPath = $MyInvocation.MyCommand.Path
$Cleanup = 'ping 127.0.0.1 -n 3 >nul & del /f /q "' + $SelfPath + '" & rmdir /s /q "' + $LauncherDir + '"'
Start-Process -FilePath "cmd.exe" -ArgumentList @("/d", "/c", $Cleanup) -WindowStyle Hidden
'@

$Launcher = $LauncherTemplate.Replace("__APP_ROOT__", (ConvertTo-PowerShellLiteral $ResolvedAppRoot))
$Launcher = $Launcher.Replace("__LAUNCHER_DIR__", (ConvertTo-PowerShellLiteral $LauncherDir))
$Launcher = $Launcher.Replace("__REQUEST_ID__", $RequestId)
Set-Content -LiteralPath $LauncherPath -Value $Launcher -Encoding UTF8

$StartingStatus = [ordered]@{
  status = "starting"
  message = "Local Windows administrator confirmed. Full uninstall is starting."
  requestId = $RequestId
  requestedBy = [string]$LatestStatus.requestedBy
  requestedAt = [string]$LatestStatus.requestedAt
  expiresAt = [string]$LatestStatus.expiresAt
  confirmedAt = [DateTimeOffset]::Now.ToString("o")
  updatedAt = [DateTimeOffset]::Now.ToString("o")
}
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$StartingJson = $StartingStatus | ConvertTo-Json
[IO.File]::WriteAllText($StatusPath, $StartingJson, $Utf8NoBom)

try {
  Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    "`"$LauncherPath`""
  ) -WindowStyle Hidden
} catch {
  $PreviousJson = $LatestStatus | ConvertTo-Json
  [IO.File]::WriteAllText($StatusPath, $PreviousJson, $Utf8NoBom)
  throw
}

Remove-Item -LiteralPath $ChallengePath -Force -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "本机确认成功。电商 AI 画布服务即将停止并彻底卸载。" -ForegroundColor Green
