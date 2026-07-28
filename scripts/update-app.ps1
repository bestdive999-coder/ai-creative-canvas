param(
  [string]$PackagePath = "",
  [string]$PackageUrl = "",
  [string]$ExpectedSha256 = "",
  [switch]$NoRestart,
  [switch]$ReplaceTemplates
)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$AppRoot = Split-Path -Parent $PSScriptRoot
$RuntimeDir = Join-Path $AppRoot "runtime"
$LogDir = Join-Path $RuntimeDir "logs"
$UpdateDir = Join-Path $RuntimeDir "updates"
$BackupRoot = Join-Path $RuntimeDir "backups"
$LogPath = Join-Path $LogDir "update.log"
$IntranetDir = Join-Path $RuntimeDir "intranet"
$StatusPath = Join-Path $IntranetDir "update-status.json"
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

function Ensure-Dirs {
  New-Item -ItemType Directory -Force -Path $RuntimeDir,$LogDir,$UpdateDir,$BackupRoot,$IntranetDir | Out-Null
}

function Write-UpdateLog($Text) {
  Ensure-Dirs
  $Line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Text
  Add-Content -LiteralPath $LogPath -Value $Line -Encoding UTF8
  Write-Host $Line
}

function Write-UpdateStatus($Status, $Message, $Extra = @{}) {
  Ensure-Dirs
  $Data = [ordered]@{
    status = $Status
    message = $Message
    packageUrl = $PackageUrl
    packagePath = $PackagePath
    startedAt = $Script:UpdateStartedAt
    finishedAt = ""
    backup = $Script:BackupDir
    updatedAt = (Get-Date -Format "o")
  }
  foreach ($Key in $Extra.Keys) {
    $Data[$Key] = $Extra[$Key]
  }
  if ($Status -eq "complete" -or $Status -eq "failed") {
    $Data["finishedAt"] = Get-Date -Format "o"
  }
  $Data | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $StatusPath -Encoding UTF8
}

function Assert-AppRoot {
  $Required = @("server.js", "admin-server.js", "public", "admin-public", "scripts")
  foreach ($Name in $Required) {
    if (-not (Test-Path -LiteralPath (Join-Path $AppRoot $Name))) {
      throw "Invalid app root. Missing $Name at $AppRoot"
    }
  }
}

function Test-Url($Url) {
  try {
    $Response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 4
    return $Response.StatusCode -ge 200 -and $Response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Stop-AppProcesses {
  Write-UpdateLog "Stopping running services for app root: $AppRoot"
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
      Write-UpdateLog "Stopping PID $($Process.ProcessId): $($Process.Name)"
      Stop-Process -Id $Process.ProcessId -Force -ErrorAction Stop
    } catch {
      Write-UpdateLog "Could not stop PID $($Process.ProcessId): $($_.Exception.Message)"
    }
  }
  Start-Sleep -Seconds 2
}

function Download-PackageIfNeeded {
  if ($PackagePath) { return $PackagePath }
  if ($PackageUrl) {
    $ParsedUrl = [Uri]$PackageUrl
    if ($ParsedUrl.Scheme -ne "https") {
      throw "Remote update packages must use HTTPS."
    }
    if ($env:ECOM_ALLOW_REMOTE_UPDATE -ne "1") {
      throw "Remote URL updates are disabled. Use a local ZIP, or explicitly set ECOM_ALLOW_REMOTE_UPDATE=1."
    }
    $Target = Join-Path $UpdateDir "package-$Timestamp.zip"
    Write-UpdateLog "Downloading update package: $PackageUrl"
    Invoke-WebRequest -UseBasicParsing -Uri $PackageUrl -OutFile $Target
    return $Target
  }

  $Default = Join-Path $UpdateDir "latest.zip"
  if (Test-Path -LiteralPath $Default) { return $Default }

  return Read-Host "Enter full ZIP package path, or put the package at runtime\updates\latest.zip"
}

function Assert-PackageSha256($Path) {
  $Expected = $ExpectedSha256.Trim().ToLowerInvariant()
  if (-not $Expected) {
    $DigestPath = "$Path.sha256"
    if (Test-Path -LiteralPath $DigestPath) {
      $Expected = ((Get-Content -LiteralPath $DigestPath -Raw).Trim() -split "\s+")[0].ToLowerInvariant()
    }
  }
  if ($Expected -notmatch "^[a-f0-9]{64}$") {
    throw "A trusted 64-character SHA-256 is required. Pass -ExpectedSha256 or provide package.zip.sha256."
  }
  $Actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($Actual -ne $Expected) {
    throw "Package SHA-256 mismatch. Expected $Expected; received $Actual."
  }
  Write-UpdateLog "Package SHA-256 verified: $Actual"
}

function Get-DirectorySignature($Path) {
  $RuntimeRoot = Join-Path $Path "runtime"
  $Files = Get-ChildItem -LiteralPath $Path -File -Recurse -ErrorAction SilentlyContinue |
    Where-Object { -not ($_.FullName.StartsWith($RuntimeRoot, [System.StringComparison]::OrdinalIgnoreCase)) } |
    Sort-Object FullName
  $Count = 0
  $Length = 0
  foreach ($File in $Files) {
    $Count += 1
    $Length += [int64]$File.Length
  }
  return "$Count files / $Length bytes"
}

function Resolve-PackageAppRoot($ExtractRoot) {
  $Candidates = New-Object System.Collections.Generic.List[string]
  $Candidates.Add($ExtractRoot)
  foreach ($Candidate in @(
    (Join-Path $ExtractRoot "app")
  )) {
    if (Test-Path -LiteralPath $Candidate) { $Candidates.Add($Candidate) }
  }

  Get-ChildItem -LiteralPath $ExtractRoot -Directory -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch "\\runtime\\" } |
    Select-Object -First 40 |
    ForEach-Object { $Candidates.Add($_.FullName) }

  foreach ($Candidate in ($Candidates | Select-Object -Unique)) {
    $HasServer = Test-Path -LiteralPath (Join-Path $Candidate "server.js")
    $HasAdmin = Test-Path -LiteralPath (Join-Path $Candidate "admin-server.js")
    $HasPublic = Test-Path -LiteralPath (Join-Path $Candidate "public")
    $HasAdminPublic = Test-Path -LiteralPath (Join-Path $Candidate "admin-public")
    if ($HasServer -and $HasAdmin -and $HasPublic -and $HasAdminPublic) {
      return $Candidate
    }
  }
  throw "No valid app folder found in update package."
}

function Expand-UpdatePackage($Path) {
  if (-not $Path) { throw "No update package path was provided." }
  $Resolved = Resolve-Path -LiteralPath $Path -ErrorAction Stop
  if ([IO.Path]::GetExtension($Resolved.Path).ToLowerInvariant() -ne ".zip") {
    throw "Update package must be a ZIP file: $($Resolved.Path)"
  }

  $ExtractRoot = Join-Path $UpdateDir "extract-$Timestamp"
  Remove-Item -LiteralPath $ExtractRoot -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $ExtractRoot | Out-Null
  Write-UpdateLog "Extracting package: $($Resolved.Path)"
  Expand-Archive -LiteralPath $Resolved.Path -DestinationPath $ExtractRoot -Force
  $PackageRoot = Resolve-PackageAppRoot $ExtractRoot
  Write-UpdateLog "Package app root: $PackageRoot"
  return $PackageRoot
}

function Invoke-Robocopy($Source, $Destination, $ExtraArgs) {
  $Args = @($Source, $Destination) + $ExtraArgs
  & robocopy.exe @Args | Out-Host
  $Code = $LASTEXITCODE
  if ($Code -ge 8) {
    throw "robocopy failed with exit code $Code"
  }
}

function Backup-CurrentApp {
  $BackupDir = Join-Path $BackupRoot "app-$Timestamp"
  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
  Write-UpdateLog "Backing up current app to: $BackupDir"
  Invoke-Robocopy $AppRoot $BackupDir @("/E", "/XD", "runtime", "/R:1", "/W:1", "/NFL", "/NDL", "/NP")
  Set-Content -LiteralPath (Join-Path $BackupDir "backup-meta.txt") -Value @(
    "createdAt=$Timestamp"
    "appRoot=$AppRoot"
    "signature=$(Get-DirectorySignature $AppRoot)"
  ) -Encoding UTF8
  return $BackupDir
}

function Apply-Update($PackageRoot) {
  Write-UpdateLog "Applying update from: $PackageRoot"
  $ExcludeDirs = @("runtime")
  if (-not $ReplaceTemplates) { $ExcludeDirs += "templates" }
  $Args = @("/E", "/R:1", "/W:1", "/NFL", "/NDL", "/NP", "/XD") + $ExcludeDirs
  Invoke-Robocopy $PackageRoot $AppRoot $Args
}

function Install-RuntimeDependencyBundle($PackageRoot) {
  $RuntimeDeps = @("python", "python-packages", "rembg-models")
  foreach ($Name in $RuntimeDeps) {
    $Source = Join-Path $PackageRoot "runtime\$Name"
    if (-not (Test-Path -LiteralPath $Source)) { continue }
    $Target = Join-Path $RuntimeDir $Name
    Write-UpdateLog "Applying runtime dependency: runtime\$Name"
    Remove-Item -LiteralPath $Target -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $Target | Out-Null
    Invoke-Robocopy $Source $Target @("/E", "/R:1", "/W:1", "/NFL", "/NDL", "/NP")
  }
}

function Install-BundledFonts {
  $Installer = Join-Path $AppRoot "scripts\install-fonts.ps1"
  $Fonts = Join-Path $AppRoot "fonts"
  if (-not (Test-Path -LiteralPath $Installer) -or -not (Test-Path -LiteralPath $Fonts)) {
    Write-UpdateLog "No bundled fonts to install."
    return
  }
  Write-UpdateLog "Installing bundled fonts."
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Installer -FontsDir $Fonts | ForEach-Object {
    Write-UpdateLog $_
  }
  if ($LASTEXITCODE -ne 0) {
    throw "Bundled font installation failed with exit code $LASTEXITCODE"
  }
}

function Start-Guardian {
  if ($NoRestart) {
    Write-UpdateLog "NoRestart enabled; services are not restarted."
    return
  }

  $Watchdog = Join-Path $AppRoot "scripts\watchdog.ps1"
  if (-not (Test-Path -LiteralPath $Watchdog)) {
    throw "watchdog.ps1 is missing after update."
  }

  Write-UpdateLog "Starting stable watchdog."
  Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $Watchdog, "-Mode", "appliance") `
    -WorkingDirectory $AppRoot `
    -WindowStyle Hidden | Out-Null

  for ($i = 1; $i -le 60; $i += 1) {
    Start-Sleep -Seconds 1
    $EmployeeOk = Test-Url "http://127.0.0.1:5173/api/health"
    $AdminOk = Test-Url "http://127.0.0.1:5188/"
    if ($EmployeeOk -and $AdminOk) {
      Write-UpdateLog "Services recovered after update."
      return
    }
  }
  throw "Services did not recover after update. Check runtime\logs."
}

function Rollback-FromBackup($BackupDir) {
  if (-not $BackupDir -or -not (Test-Path -LiteralPath $BackupDir)) {
    Write-UpdateLog "No backup available for rollback."
    return
  }
  Write-UpdateLog "Rolling back from backup: $BackupDir"
  Invoke-Robocopy $BackupDir $AppRoot @("/E", "/XD", "runtime", "/R:1", "/W:1", "/NFL", "/NDL", "/NP")
}

Ensure-Dirs
Assert-AppRoot
$Script:UpdateStartedAt = Get-Date -Format "o"
$Script:BackupDir = ""
$Mutex = New-Object System.Threading.Mutex($false, "Global\EcommerceAIUpdate-$([Math]::Abs($AppRoot.GetHashCode()))")
if (-not $Mutex.WaitOne(0)) {
  throw "Another update task is already running."
}

$BackupDir = ""
try {
  Write-UpdateStatus "running" "更新开始。"
  Write-UpdateLog "Update started. appRoot=$AppRoot"
  $Package = Download-PackageIfNeeded
  Assert-PackageSha256 $Package
  $PackageRoot = Expand-UpdatePackage $Package
  Write-UpdateLog "Current signature: $(Get-DirectorySignature $AppRoot)"
  Write-UpdateLog "Package signature: $(Get-DirectorySignature $PackageRoot)"
  Stop-AppProcesses
  $BackupDir = Backup-CurrentApp
  $Script:BackupDir = $BackupDir
  Apply-Update $PackageRoot
  Install-RuntimeDependencyBundle $PackageRoot
  Write-UpdateLog "Bundled font installation skipped during update."
  Start-Guardian
  Write-UpdateLog "Update completed. backup=$BackupDir"
  Write-UpdateStatus "complete" "更新完成，员工端和管理端已恢复。" @{ backup = $BackupDir }
} catch {
  Write-UpdateLog "ERROR: $($_.Exception.Message)"
  Write-UpdateStatus "failed" "更新失败：$($_.Exception.Message)" @{ backup = $BackupDir }
  if ($BackupDir) {
    try {
      Rollback-FromBackup $BackupDir
      Start-Guardian
      Write-UpdateLog "Rollback after failed update completed."
      Write-UpdateStatus "failed" "更新失败，已回滚到上一版：$($_.Exception.Message)" @{ backup = $BackupDir; rolledBack = $true }
    } catch {
      Write-UpdateLog "ROLLBACK ERROR: $($_.Exception.Message)"
      Write-UpdateStatus "failed" "更新失败，回滚也失败：$($_.Exception.Message)" @{ backup = $BackupDir; rollbackError = $_.Exception.Message }
    }
  }
  throw
} finally {
  $Mutex.ReleaseMutex() | Out-Null
  $Mutex.Dispose()
}
