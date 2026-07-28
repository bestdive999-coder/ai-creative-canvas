param(
  [string]$FontsDir = "",
  [switch]$Force
)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$AppRoot = Split-Path -Parent $PSScriptRoot
if (-not $FontsDir) {
  $FontsDir = Join-Path $AppRoot "fonts"
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
    Write-Output "Maintenance Agent reload could not be scheduled: $($_.Exception.Message)"
  }
}

if (-not $Force -and $env:ECOM_ALLOW_FONT_INSTALL -ne "1") {
  Start-MaintenanceAgentReload
  Write-Output "Bundled font installation skipped. Use -Force only for manual font maintenance."
  exit 0
}

if (-not (Test-Path -LiteralPath $FontsDir)) {
  Write-Output "No bundled fonts folder: $FontsDir"
  exit 0
}

function Test-IsAdmin {
  try {
    $Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $Principal = New-Object Security.Principal.WindowsPrincipal($Identity)
    return $Principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  } catch {
    return $false
  }
}

$InstallForMachine = Test-IsAdmin
if ($InstallForMachine) {
  $TargetDir = Join-Path $env:WINDIR "Fonts"
  $RegPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts"
  Write-Output "Installing fonts for all users."
} else {
  $TargetDir = Join-Path $env:LOCALAPPDATA "Microsoft\Windows\Fonts"
  $RegPath = "HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts"
  Write-Output "Installing fonts for current user. Run as administrator if desktop applications cannot see them."
}

New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
New-Item -Path $RegPath -Force | Out-Null

$Fonts = Get-ChildItem -LiteralPath $FontsDir -File | Where-Object { $_.Extension -match "^\.(otf|ttf)$" }
foreach ($Font in $Fonts) {
  $Target = Join-Path $TargetDir $Font.Name
  if (-not (Test-Path -LiteralPath $Target) -or ((Get-Item -LiteralPath $Target).Length -ne $Font.Length)) {
    Copy-Item -LiteralPath $Font.FullName -Destination $Target -Force
  }
  $Kind = if ($Font.Extension -ieq ".otf") { "OpenType" } else { "TrueType" }
  $BaseName = [IO.Path]::GetFileNameWithoutExtension($Font.Name)
  $RegistryValue = if ($InstallForMachine) { $Font.Name } else { $Target }
  Set-ItemProperty -Path $RegPath -Name "$BaseName ($Kind)" -Value $RegistryValue
}

try {
  $Code = 'using System; using System.Runtime.InteropServices; public class FontChangeNotify { [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult); }'
  Add-Type -TypeDefinition $Code -ErrorAction SilentlyContinue
  $Result = [UIntPtr]::Zero
  [FontChangeNotify]::SendMessageTimeout([IntPtr]0xffff, 0x001D, [UIntPtr]::Zero, "Font", 2, 5000, [ref]$Result) | Out-Null
} catch {
}

Write-Output "Installed $($Fonts.Count) bundled font(s)."
