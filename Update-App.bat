@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo AI Canvas Full System - Safe Update
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-app.ps1" %*
if errorlevel 1 (
  echo.
  echo [ERROR] Update failed. The old version was kept or can be restored with Rollback-App.bat.
  echo.
  pause
  exit /b 1
)
echo.
echo Update finished.
echo.
pause
