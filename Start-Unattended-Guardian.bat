@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Starting AI Canvas unattended guardian...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\watchdog.ps1" -Mode appliance
if errorlevel 1 (
  echo.
  echo [ERROR] Guardian stopped. Check runtime\logs\watchdog.log
  echo.
  pause
  exit /b 1
)
