@echo off
REM === Build Nova into a Windows .exe (double-click me) ===
cd /d "%~dp0"
echo Installing build tools (first run downloads electron-builder)...
call npm install
if errorlevel 1 goto err
echo.
echo Building the .exe ... this can take a few minutes the first time.
call npm run dist
if errorlevel 1 goto err
echo.
echo ===============================================
echo  Done!  Your files are in the  dist  folder:
echo    Nova-8.1.0-x64.exe          (installer)
echo    Nova-8.1.0-portable.exe     (USB-ready)
echo ===============================================
start "" "dist"
pause
exit /b 0
:err
echo.
echo Build failed - scroll up for the first red error line.
echo If it mentions a download, re-run on a normal network.
pause
exit /b 1
