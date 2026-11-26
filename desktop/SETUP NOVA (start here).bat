@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

REM --- self-elevate to Administrator (needed so the build can extract symlinks) ---
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo.
  echo   Nova's build step needs Administrator rights (just once, to unpack a
  echo   build tool). Windows will now ask for permission - click YES.
  echo.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs" >nul 2>&1
  exit /b
)
cd /d "%~dp0"
title Nova - Setup and Build Guide
color 0E
mode con: cols=78 lines=34

cls
echo.
echo   ==========================================================================
echo                       N O V A   -   S E T U P   G U I D E
echo   ==========================================================================
echo.
echo     This will walk you through everything, one step at a time.
echo     At each step, read the screen, then press ENTER to continue.
echo.
echo     What it does:
echo       1. Checks that Node.js is installed
echo       2. Installs Nova's dependencies
echo       3. (optional) Opens Nova so you can try it
echo       4. Builds the Windows .exe (installer + portable)
echo       5. Opens the folder with your finished .exe
echo       6. (optional) Shows how to turn on cloud sync
echo.
set /p "go= Press ENTER to begin . . . "

:STEP1
cls
echo.
echo   -------------------------------------------------------------------------
echo    STEP 1 of 6  -  Check Node.js
echo   -------------------------------------------------------------------------
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo    X  Node.js is NOT installed. Nova needs it to run and build.
  echo.
  echo       I'll open the download page. Install the "LTS" version,
  echo       accept the defaults, then run this file again.
  echo.
  set /p "x= Press ENTER to open nodejs.org and exit . . . "
  start "" https://nodejs.org
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do set NODEV=%%v
echo    OK  Node.js is installed  ^(version !NODEV!^)
echo.
echo    Good to go.
echo.
set /p "x= Press ENTER for step 2 . . . "

:STEP2
cls
echo.
echo   -------------------------------------------------------------------------
echo    STEP 2 of 6  -  Install dependencies
echo   -------------------------------------------------------------------------
echo.
echo    This downloads the pieces Nova needs (Electron + the builder).
echo    First time can take a few minutes. You only do this once.
echo.
set /p "x= Press ENTER to run  npm install . . . "
echo.
call npm install
if errorlevel 1 (
  echo.
  echo    X  Something went wrong during install. Scroll up for the first
  echo       red error line. If it mentions the network, try again on a
  echo       normal internet connection.
  echo.
  set /p "x= Press ENTER to exit . . . "
  exit /b 1
)
echo.
echo    OK  Dependencies installed.
echo.
set /p "x= Press ENTER for step 3 . . . "

:STEP3
cls
echo.
echo   -------------------------------------------------------------------------
echo    STEP 3 of 6  -  Try Nova now  (optional)
echo   -------------------------------------------------------------------------
echo.
echo    Want to open Nova and look around before building the .exe?
echo    When you're done, just CLOSE the Nova window and this guide
echo    will carry on.
echo.
choice /c YN /n /m "    Open Nova now?  [Y = yes]  [N = skip]  "
if errorlevel 2 goto STEP4
echo.
echo    Opening Nova . . .  (close its window to continue)
echo.
call npm start
echo.
echo    OK  Welcome back.
echo.
set /p "x= Press ENTER for step 4 . . . "

:STEP4
cls
echo.
echo   -------------------------------------------------------------------------
echo    STEP 4 of 6  -  Build the Windows .exe
echo   -------------------------------------------------------------------------
echo.
echo    This creates:
echo       dist\Nova-8.1.0-x64.exe        the installer
echo       dist\Nova-8.1.0-portable.exe   runs with no install (USB-ready)
echo.
echo    The first build downloads a few build tools, so give it a few minutes.
echo.
set /p "x= Press ENTER to build . . . "
echo.
call npm run dist
if errorlevel 1 (
  echo.
  echo    X  The build failed. Scroll up for the first red error line.
  echo       Most often it's a blocked download - re-run on a normal network.
  echo.
  set /p "x= Press ENTER to exit . . . "
  exit /b 1
)
echo.
echo    OK  Build finished!
echo.
set /p "x= Press ENTER for step 5 . . . "

:STEP5
cls
echo.
echo   -------------------------------------------------------------------------
echo    STEP 5 of 6  -  Your finished app
echo   -------------------------------------------------------------------------
echo.
echo    Opening the  dist  folder now. Inside:
echo.
echo       Nova-8.1.0-x64.exe        double-click to INSTALL Nova
echo       Nova-8.1.0-portable.exe   double-click to RUN without installing
echo                                 (copy this one onto a USB stick to carry it)
echo.
if exist "dist" ( start "" "dist" ) else ( echo    ^(dist folder not found - check the build step above^) )
echo.
set /p "x= Press ENTER for the last step . . . "

:STEP6
cls
echo.
echo   -------------------------------------------------------------------------
echo    STEP 6 of 6  -  Cloud sync with your phone  (optional)
echo   -------------------------------------------------------------------------
echo.
echo    To keep this computer and your phone in sync:
echo       1. Make a free project at supabase.com
echo       2. Run the SQL from SUPABASE-SETUP.md (one paste)
echo       3. In Nova: Settings - Cloud sync - enter your URL, key,
echo          an account name and a pass-phrase (same on every device)
echo.
echo    Your data is encrypted on your device before it's uploaded.
echo.
choice /c YN /n /m "    Open the setup guide now?  [Y]  [N]  "
if errorlevel 2 goto DONE
if exist "SUPABASE-SETUP.md" ( start "" "SUPABASE-SETUP.md" ) else ( echo    ^(SUPABASE-SETUP.md not found^) )

:DONE
cls
echo.
echo   ==========================================================================
echo                        A L L   D O N E  -  enjoy Nova!
echo   ==========================================================================
echo.
echo     Your .exe files are in the  dist  folder.
echo     To rebuild later, just run this file again (it's quick after the
echo     first time).
echo.
echo     Run Nova without building:   npm start
echo.
set /p "x= Press ENTER to close . . . "
endlocal
exit /b 0
