@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo AI Canvas Full System - Rollback
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\rollback-app.ps1" %*
if errorlevel 1 (
  echo.
  echo [ERROR] Rollback failed. Check runtime\logs\update.log.
  echo.
  pause
  exit /b 1
)
echo.
echo Rollback finished.
echo.
pause
