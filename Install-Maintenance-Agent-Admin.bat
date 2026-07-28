@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo Installing AI Canvas Maintenance Agent...
echo This requires administrator permission.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell.exe -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%~dp0scripts\install-maintenance-agent.ps1""'"
echo.
echo If a UAC window appeared, approve it and wait a few seconds.
echo.
pause
