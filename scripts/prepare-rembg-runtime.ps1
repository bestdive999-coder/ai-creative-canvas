param(
  [string]$PythonExe = "",
  [switch]$SkipModelDownload,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$AppRoot = Split-Path -Parent $PSScriptRoot
$RuntimeDir = Join-Path $AppRoot "runtime"
$RuntimePython = Join-Path $RuntimeDir "python\python.exe"
$PackagesDir = Join-Path $RuntimeDir "python-packages"
$ModelsDir = Join-Path $RuntimeDir "rembg-models"
$LockFile = Join-Path $AppRoot "requirements-rembg.lock"

if (-not $PythonExe) {
  $PythonExe = $RuntimePython
}

if (-not (Test-Path -LiteralPath $PythonExe)) {
  throw "Python runtime not found. Put portable Python at runtime\python\python.exe, or pass -PythonExe."
}

function Invoke-Step($Title, $Command) {
  Write-Output ""
  Write-Output "== $Title =="
  & $PythonExe @Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Title failed with exit code $LASTEXITCODE"
  }
}

New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
New-Item -ItemType Directory -Force -Path $PackagesDir,$ModelsDir | Out-Null

Invoke-Step "Check Python" @("-c", "import sys; print(sys.executable); print(sys.version)")
Invoke-Step "Require Python 3.12" @("-c", "import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 12) else 'Python 3.12 x64 is required')")

$PipCheck = & $PythonExe -m pip --version 2>$null
if ($LASTEXITCODE -ne 0) {
  Invoke-Step "Enable pip" @("-m", "ensurepip", "--upgrade")
}

if (-not (Test-Path -LiteralPath $LockFile)) {
  throw "Locked dependency file not found: $LockFile"
}
if ($Force -or -not (Test-Path -LiteralPath (Join-Path $PackagesDir "rembg"))) {
  Remove-Item -LiteralPath $PackagesDir -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $PackagesDir | Out-Null
  Invoke-Step "Install rembg packages" @(
    "-m",
    "pip",
    "install",
    "--require-hashes",
    "--only-binary",
    ":all:",
    "--target",
    $PackagesDir,
    "-r",
    $LockFile
  )
} else {
  Write-Output ""
  Write-Output "== Install rembg packages =="
  Write-Output "Existing runtime\python-packages found. Use -Force to reinstall."
}

$env:PYTHONPATH = if ($env:PYTHONPATH) { "$PackagesDir;$env:PYTHONPATH" } else { $PackagesDir }
$env:U2NET_HOME = $ModelsDir
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

$VerifyScript = @"
import os, sys
pkg = os.environ.get('PYTHONPATH', '').split(os.pathsep)[0]
if pkg:
    sys.path.insert(0, pkg)
os.environ['U2NET_HOME'] = os.environ.get('U2NET_HOME', '')
from PIL import Image
import onnxruntime
import rembg
print('Pillow', Image.__version__)
print('onnxruntime', onnxruntime.__version__)
print('rembg import ok')
"@

Invoke-Step "Verify imports" @("-c", $VerifyScript)

if (-not $SkipModelDownload) {
  $ModelScript = @"
import os, sys
pkg = os.environ.get('PYTHONPATH', '').split(os.pathsep)[0]
if pkg:
    sys.path.insert(0, pkg)
os.environ['U2NET_HOME'] = os.environ.get('U2NET_HOME', '')
from rembg import new_session
for model in ('u2net',):
    new_session(model)
    print('model ready', model)
"@
  Invoke-Step "Download rembg models" @("-c", $ModelScript)
  Write-Output "isnet-general-use is not downloaded automatically."
  Write-Output "Only provide it manually after reviewing its model license."
}

Write-Output ""
Write-Output "rembg runtime is ready:"
Write-Output "  $PackagesDir"
Write-Output "  $ModelsDir"
Write-Output "Include runtime\python, runtime\python-packages, and runtime\rembg-models in the update package."
