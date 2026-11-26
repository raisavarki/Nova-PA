@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title Nova - Build portable USB
color 0E

echo ==========================================================
echo   Nova - build a portable copy for a USB stick
echo ==========================================================
echo.
echo  This copies the Electron runtime + Nova into a self-contained
echo  folder. On the target PC you just double-click Nova.exe - no
echo  Node.js, no install, nothing left behind.
echo.

rem --- the Electron runtime must already be here (run start.bat once first) ---
if not exist "node_modules\electron\dist\electron.exe" (
  echo  [X] Electron runtime not found.
  echo      Run start.bat once on this PC first so Nova downloads it,
  echo      then run make-usb.bat again.
  echo.
  pause & exit /b 1
)

set "DEST="
set /p DEST=" Where should I build it?  (e.g.  E:   or   E:\Nova)  [blank = .\usb-build\Nova]:  "
if "!DEST!"=="" set "DEST=%~dp0usb-build\Nova"
rem a bare drive letter (E:) becomes E:\Nova
if "!DEST:~1!"==":" set "DEST=!DEST!\Nova"
if "!DEST:~1,2!"==":\" if "!DEST:~3!"=="" set "DEST=!DEST!Nova"

echo.
echo  Building into:  !DEST!
echo.
if not exist "!DEST!" mkdir "!DEST!" 2>nul
if not exist "!DEST!" (
  echo  [X] Could not create that folder. Check the drive letter / permissions.
  pause & exit /b 1
)

echo  [1/6] Copying the Electron runtime...
robocopy "node_modules\electron\dist" "!DEST!" /E /NFL /NDL /NJH /NJS /NP >nul
if exist "!DEST!\electron.exe" (
  if exist "!DEST!\Nova.exe" del /q "!DEST!\Nova.exe"
  ren "!DEST!\electron.exe" "Nova.exe"
)

echo  [2/6] Copying the Nova app...
robocopy "." "!DEST!\resources\app" /E /NFL /NDL /NJH /NJS /NP ^
  /XD node_modules data .cache usb-build .git tools ^
  /XF make-usb.bat free-c-space.bat >nul
rem app runs from resources\app (package.json main = src\main.js); no npm modules needed at runtime.

echo  [3/6] Copying your current data (tasks, reminders, settings)...
if exist "data" robocopy "data" "!DEST!\data" /E /NFL /NDL /NJH /NJS /NP >nul
if not exist "!DEST!\data" mkdir "!DEST!\data"

echo  [4/6] Copying the auto-launch helper...
if exist "tools" robocopy "tools" "!DEST!\tools" /E /NFL /NDL /NJH /NJS /NP >nul

echo  [5/6] Writing the portable marker + launcher...
> "!DEST!\nova-portable.txt" echo Nova portable marker - do not delete. Nova stores its data in the data\ folder next to this file.

> "!DEST!\Start Nova.bat" echo @echo off
>> "!DEST!\Start Nova.bat" echo cd /d "%%~dp0"
>> "!DEST!\Start Nova.bat" echo start "" "%%~dp0Nova.exe"

if exist "assets\icon.ico" copy /y "assets\icon.ico" "!DEST!\nova.ico" >nul
> "!DEST!\autorun.inf" echo [autorun]
>> "!DEST!\autorun.inf" echo label=Nova
if exist "!DEST!\nova.ico" >> "!DEST!\autorun.inf" echo icon=nova.ico

echo  [6/6] Writing the readme...
> "!DEST!\READ ME FIRST.txt" echo Nova - portable
>> "!DEST!\READ ME FIRST.txt" echo ===============
>> "!DEST!\READ ME FIRST.txt" echo.
>> "!DEST!\READ ME FIRST.txt" echo 1) Double-click  Nova.exe  (or "Start Nova.bat"). Nothing is installed.
>> "!DEST!\READ ME FIRST.txt" echo 2) First time on each PC, if you set a PIN, Nova asks for it to unlock your AI keys.
>> "!DEST!\READ ME FIRST.txt" echo 3) Quit from the tray with "Safe eject" before you unplug.
>> "!DEST!\READ ME FIRST.txt" echo.
>> "!DEST!\READ ME FIRST.txt" echo Auto-start on a PC you own (optional):
>> "!DEST!\READ ME FIRST.txt" echo    run  tools\Install auto-launch (this PC).bat  once on that PC.
>> "!DEST!\READ ME FIRST.txt" echo    After that, plugging the USB in launches Nova by itself.
>> "!DEST!\READ ME FIRST.txt" echo    Remove it any time with  tools\Remove auto-launch (this PC).bat

echo.
echo ==========================================================
echo   Done.  Your portable Nova is here:
echo   !DEST!
echo ==========================================================
echo.
echo   Copy that whole folder onto your USB stick (if you didn't
echo   build straight onto it), then double-click Nova.exe there.
echo.
pause
endlocal
