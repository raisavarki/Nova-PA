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
echo    Bakes YOUR Supabase project into the app, then pushes to GitHub so the
echo    build is already connected. From Supabase - Project Settings - API:
echo       1. Project URL        (https://xxxx.supabase.co)
echo       2. anon public key    (the long eyJ... string)   [NOT service_role]
echo.
set /p "x= Press ENTER to begin . . . "

echo.
set "SURL="
set /p "SURL=   Paste your Project URL:  "
if "!SURL!"=="" ( echo    (nothing entered - aborting) & pause & exit /b 1 )
set "SKEY="
set /p "SKEY=   Paste your anon public key:  "
if "!SKEY!"=="" ( echo    (nothing entered - aborting) & pause & exit /b 1 )
if "!SURL:~-1!"=="/" set "SURL=!SURL:~0,-1!"

echo.
echo   Writing connection into the mobile app . . .
> "mobile\www\supabase-config.js" echo /* Nova - Supabase connection (written by connect-supabase.bat). */
>> "mobile\www\supabase-config.js" echo window.NOVA_SUPABASE = {
>> "mobile\www\supabase-config.js" echo   url: "!SURL!",
>> "mobile\www\supabase-config.js" echo   anonKey: "!SKEY!"
>> "mobile\www\supabase-config.js" echo };
echo   OK  mobile\www\supabase-config.js

REM --- make SURE we use THIS folder's own repo, not a parent (e.g. your home folder) ---
set "ISOWN="
for /f "delims=" %%r in ('git rev-parse --show-toplevel 2^>nul') do set "TOP=%%r"
if defined TOP (
  set "HERE=%CD:\=/%"
  if /i "!TOP!"=="!HERE!" set "ISOWN=1"
)
if not defined ISOWN (
  echo.
  echo   Setting up a git repo in THIS folder (so files don't land elsewhere)...
  git init >nul
  git branch -M main >nul 2>nul
)

REM --- ensure an 'origin' remote exists ---
git remote get-url origin >nul 2>nul
if errorlevel 1 (
  echo.
  echo   No GitHub remote set for this folder.
  set "GURL="
  set /p "GURL=   Paste your GitHub repo URL (https://github.com/you/Nova-PA.git):  "
  if "!GURL!"=="" ( echo    (no URL - aborting) & pause & exit /b 1 )
  git remote add origin "!GURL!"
)

echo.
echo   Opening the SQL to run in Supabase (SQL Editor - paste - Run)...
start "" "nova-supabase.sql"
set /p "x= Press ENTER to commit and push (this triggers the build) . . . "

echo.
git add .
git commit -m "Connect Supabase (accounts)"
git branch -M main >nul 2>nul
git push -u origin main
if errorlevel 1 (
  echo.
  echo   Push was rejected (the repo already has different history).
  choice /c YN /n /m "   Overwrite the GitHub repo with THIS version?  [Y/N]  "
  if errorlevel 2 ( echo    Left as-is. Run: git pull origin main --allow-unrelated-histories  & pause & exit /b 1 )
  git push -u origin main --force
  if errorlevel 1 ( echo    Still failed - check the repo URL / your GitHub login. & pause & exit /b 1 )
)
echo.
echo   ==========================================================================
echo    DONE. GitHub is building. Repo - Actions tab to watch; the APK + EXE are
echo    published to the "latest" Release when it finishes.
echo   ==========================================================================
echo.
set /p "x= Press ENTER to close . . . "
endlocal
exit /b 0
