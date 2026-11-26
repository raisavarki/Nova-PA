@echo off
setlocal EnableDelayedExpansion
title Nova - remove auto-launch from this PC
color 0E

echo  Removing Nova's USB auto-launch from this PC...
echo.

rem stop the running watcher (if any)
set "PIDFILE=%TEMP%\nova-watch.pid"
if exist "%PIDFILE%" (
  set /p WPID=<"%PIDFILE%"
  if defined WPID taskkill /pid !WPID! /f >nul 2>nul
  del /q "%PIDFILE%" >nul 2>nul
)

rem remove the logon task + the copied helper
schtasks /delete /tn "NovaUSBWatch" /f >nul 2>nul
if exist "%LOCALAPPDATA%\NovaWatcher" rmdir /s /q "%LOCALAPPDATA%\NovaWatcher" >nul 2>nul

echo  [OK] Auto-launch removed. Nova itself is untouched - you can
echo       still start it by double-clicking Nova.exe on the USB.
echo.
pause
endlocal
