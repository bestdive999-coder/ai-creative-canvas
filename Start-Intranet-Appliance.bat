@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-intranet-appliance.ps1"
if errorlevel 1 (
  echo.
  echo [ERROR] System failed to start. Check the messages above.
  echo.
  pause
  exit /b 1
)
start "" "http://127.0.0.1:5173/"
start "" "http://127.0.0.1:5188/"
echo.
pause
