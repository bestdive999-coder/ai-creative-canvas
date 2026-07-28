@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-local-source-5273.ps1"
if errorlevel 1 (
  echo.
  echo [ERROR] Local source app failed to start. Check the messages above.
  echo.
  pause
  exit /b 1
)
echo.
pause
