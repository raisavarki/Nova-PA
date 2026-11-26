@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Nova - Connect Supabase
color 0B
cls
echo.
echo   ==========================================================================
echo              N O V A   -   C O N N E C T   S U P A B A S E
echo   ==========================================================================
echo.
echo    This bakes YOUR Supabase project into the app, then pushes to GitHub
echo    so the APK (and later the desktop) builds already connected. Users then
echo    sign up once (email + password) and unlock with a PIN on any device.
echo.
echo    You need two things from Supabase - Project Settings - API:
echo       1. Project URL        (https://xxxx.supabase.co)
echo       2. anon public key    (the long eyJ... string)
echo.
echo    Do NOT paste the service_role key - only the anon public key.
echo.
set /p "x= Press ENTER to begin . . . "

echo.
set "SURL="
set /p "SURL=   Paste your Project URL:  "
if "!SURL!"=="" ( echo    ^(nothing entered - aborting^) & pause & exit /b 1 )

echo.
set "SKEY="
set /p "SKEY=   Paste your anon public key:  "
if "!SKEY!"=="" ( echo    ^(nothing entered - aborting^) & pause & exit /b 1 )

REM strip a trailing slash from the URL
if "!SURL:~-1!"=="/" set "SURL=!SURL:~0,-1!"

echo.
echo   Writing connection into the mobile app . . .
> "mobile\www\supabase-config.js" echo /* Nova - Supabase connection (written by connect-supabase.bat). */
>> "mobile\www\supabase-config.js" echo window.NOVA_SUPABASE = {
>> "mobile\www\supabase-config.js" echo   url: "!SURL!",
>> "mobile\www\supabase-config.js" echo   anonKey: "!SKEY!"
>> "mobile\www\supabase-config.js" echo };
echo   OK  mobile\www\supabase-config.js

echo.
echo   -------------------------------------------------------------------------
echo    IMPORTANT - one-time Supabase setup (if you have not done it):
echo      1. Supabase - SQL Editor - paste the contents of  nova-supabase.sql
echo         and click Run. (Opening it now.)
echo      2. Supabase - Authentication - Providers - Email:
echo         for the smoothest sign-up, turn OFF "Confirm email"
echo         (or leave it on and users click the email link once).
echo   -------------------------------------------------------------------------
echo.
start "" "nova-supabase.sql"
set /p "x= Press ENTER to push to GitHub (this triggers the build) . . . "

echo.
git add .
git commit -m "Connect Supabase (accounts)"
if errorlevel 1 echo    (nothing to commit, or commit skipped - continuing)
git push
if errorlevel 1 (
  echo.
  echo    X  Push failed. If this is the first push, set the remote first:
  echo         git remote add origin https://github.com/YOUR/REPO.git
  echo         git push -u origin main
  echo.
  pause & exit /b 1
)
echo.
echo   ==========================================================================
echo    DONE. GitHub is now building. Open your repo - Actions tab to watch,
echo    then download the APK from the finished run's Artifacts (or Release).
echo   ==========================================================================
echo.
set /p "x= Press ENTER to close . . . "
endlocal
exit /b 0
