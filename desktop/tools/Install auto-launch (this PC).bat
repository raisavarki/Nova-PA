@echo off
setlocal
cd /d "%~dp0"
title Nova - install auto-launch on this PC
color 0E

echo =============================================================
echo   Nova - auto-launch when the USB is plugged into THIS PC
echo =============================================================
echo.
echo  This installs a small background watcher on THIS computer
echo  (only for your Windows account). When it sees the Nova USB,
echo  it starts Nova for you within a few seconds.
echo.
echo  - It is copied to your profile, so it keeps working after you
echo    unplug the USB.
echo  - It only ever starts the Nova.exe you put on the USB.
echo  - Remove it any time with "Remove auto-launch (this PC).bat".
echo.
echo  Install it on this PC?
choice /c YN /m "  [Y] Yes  [N] No"
if errorlevel 2 goto :no

set "HOME_DIR=%LOCALAPPDATA%\NovaWatcher"
if not exist "%HOME_DIR%" mkdir "%HOME_DIR%"
copy /y "%~dp0nova-watcher.ps1" "%HOME_DIR%\nova-watcher.ps1" >nul

set "CMD=powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%HOME_DIR%\nova-watcher.ps1\""
schtasks /create /tn "NovaUSBWatch" /tr "%CMD%" /sc onlogon /rl limited /f >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [X] Could not register the logon task. Your workplace policy may block it.
  echo      Nothing was changed. You can still launch Nova by double-clicking Nova.exe.
  echo.
  pause & exit /b 1
)

rem start it now too, so you don't have to sign out first
start "" powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File "%HOME_DIR%\nova-watcher.ps1"

echo.
echo  [OK] Installed. Plug in the Nova USB and it will start on its own.
echo.
pause
exit /b 0

:no
echo  Cancelled - nothing was changed.
pause
endlocal
