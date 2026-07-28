param()

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$AppRoot = Split-Path -Parent $PSScriptRoot
$RuntimeDir = Join-Path $AppRoot "runtime"
$BackupDir = Join-Path $RuntimeDir "font-registry-backups"
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

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
  throw "Administrator permission is required to repair Windows font registry."
}

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
try {
  & reg.exe export "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts" (Join-Path $BackupDir "Fonts-$Stamp.reg") /y | Out-Null
  & reg.exe export "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\FontSubstitutes" (Join-Path $BackupDir "FontSubstitutes-$Stamp.reg") /y | Out-Null
} catch {
  Write-Output "Registry backup warning: $($_.Exception.Message)"
}

$FontReg = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts"
$SubReg = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\FontSubstitutes"
New-Item -Path $FontReg -Force | Out-Null
New-Item -Path $SubReg -Force | Out-Null

$ExpectedFonts = @(
  @{ Name = "Microsoft YaHei & Microsoft YaHei UI (TrueType)"; File = "msyh.ttc" },
  @{ Name = "Microsoft YaHei Bold & Microsoft YaHei UI Bold (TrueType)"; File = "msyhbd.ttc" },
  @{ Name = "Microsoft YaHei Light & Microsoft YaHei UI Light (TrueType)"; File = "msyhl.ttc" },
  @{ Name = "SimSun & NSimSun (TrueType)"; File = "simsun.ttc" },
  @{ Name = "SimSun-ExtB (TrueType)"; File = "simsunb.ttf" },
  @{ Name = "SimHei (TrueType)"; File = "simhei.ttf" },
  @{ Name = "KaiTi (TrueType)"; File = "simkai.ttf" },
  @{ Name = "FangSong (TrueType)"; File = "simfang.ttf" },
  @{ Name = "Microsoft JhengHei & Microsoft JhengHei UI (TrueType)"; File = "msjh.ttc" },
  @{ Name = "Microsoft JhengHei Bold & Microsoft JhengHei UI Bold (TrueType)"; File = "msjhbd.ttc" },
  @{ Name = "Microsoft JhengHei Light & Microsoft JhengHei UI Light (TrueType)"; File = "msjhl.ttc" }
)

$Missing = New-Object System.Collections.Generic.List[string]
foreach ($Font in $ExpectedFonts) {
  $FontPath = Join-Path $env:WINDIR ("Fonts\" + $Font.File)
  if (Test-Path -LiteralPath $FontPath) {
    New-ItemProperty -Path $FontReg -Name $Font.Name -Value $Font.File -PropertyType String -Force | Out-Null
  } else {
    $Missing.Add($Font.File) | Out-Null
  }
}

New-ItemProperty -Path $SubReg -Name "MS Shell Dlg" -Value "Microsoft YaHei UI" -PropertyType String -Force | Out-Null
New-ItemProperty -Path $SubReg -Name "MS Shell Dlg 2" -Value "Microsoft YaHei UI" -PropertyType String -Force | Out-Null

try { Stop-Service -Name "FontCache" -Force -ErrorAction SilentlyContinue } catch {}
Start-Sleep -Milliseconds 500

$CachePaths = @(
  (Join-Path $env:WINDIR "ServiceProfiles\LocalService\AppData\Local\FontCache\*"),
  (Join-Path $env:LOCALAPPDATA "FontCache\*"),
  (Join-Path $env:WINDIR "System32\FNTCACHE.DAT")
)
foreach ($CachePath in $CachePaths) {
  try { Remove-Item -LiteralPath $CachePath -Recurse -Force -ErrorAction SilentlyContinue } catch {}
}

try { Start-Service -Name "FontCache" -ErrorAction SilentlyContinue } catch {}

try {
  $Code = 'using System; using System.Runtime.InteropServices; public class FontChangeNotify { [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult); }'
  Add-Type -TypeDefinition $Code -ErrorAction SilentlyContinue
  $Result = [UIntPtr]::Zero
  [FontChangeNotify]::SendMessageTimeout([IntPtr]0xffff, 0x001D, [UIntPtr]::Zero, "Font", 2, 5000, [ref]$Result) | Out-Null
} catch {
}

Write-Output "Windows Chinese font registry repaired."
Write-Output "Registry backup folder: $BackupDir"
if ($Missing.Count -gt 0) {
  Write-Output ("Missing Windows font files: " + (($Missing | Sort-Object -Unique) -join ", "))
  Write-Output "If Chinese text still shows squares after restart, run Windows system repair: sfc /scannow"
} else {
  Write-Output "Core Windows Chinese font files are present."
}
Write-Output "Restart Windows to fully reload Explorer, Edge, and shell font fallback."
