@echo off
REM Keep this window open no matter what (so it never silently closes on an error).
if not defined NOVA_KEPT (
  set "NOVA_KEPT=1"
  cmd /k call "%~f0"
  exit /b
)
setlocal EnableExtensions
title Nova - Setup Guide
color 0E
cd /d "%~dp0"

REM ===================================================================
REM  NOVA - one guided setup. Press a key after each step to continue.
REM  Covers: Supabase, GitHub build (APK + EXE), Vercel site,
REM          ElevenLabs voice, and building the EXE locally.
REM ===================================================================

:MENU
cls
echo.
echo   ==========================================================
echo                 N O V A   -   S E T U P   G U I D E
echo   ==========================================================
echo.
echo   This walks you through everything, one step at a time.
echo   You can run a single step or go through all of them.
echo.
echo     [1]  Connect Supabase (accounts + sync)
echo     [2]  Set up the database + turn OFF email confirmation
echo     [3]  Push to GitHub  (GitHub builds the APK and EXE for you)
echo     [4]  Get your APK and EXE after the build
echo     [5]  Put the download website live on Vercel
echo     [6]  Turn on ElevenLabs voice (in the desktop app)
echo     [7]  Build the Windows EXE on THIS PC (optional)
echo     [A]  Run every step in order
echo     [Q]  Quit
echo.
set "pick="
set /p "pick=  Choose and press Enter:  "
if /i "%pick%"=="1" goto STEP1
if /i "%pick%"=="2" goto STEP2
if /i "%pick%"=="3" goto STEP3
if /i "%pick%"=="4" goto STEP4
if /i "%pick%"=="5" goto STEP5
if /i "%pick%"=="6" goto STEP6
if /i "%pick%"=="7" goto STEP7
if /i "%pick%"=="A" ( set "ALL=1" & goto STEP1 )
if /i "%pick%"=="Q" goto END
goto MENU

REM ===================================================================
:STEP1
cls
echo   ----------------------------------------------------------
echo    STEP 1 of 7  -  Connect Supabase
echo   ----------------------------------------------------------
echo.
echo   Supabase is the free database that lets a user sign up on one
echo   device and sign in on any other with their PIN.
echo.
echo   Get these from  https://supabase.com  -  your project -
echo   Settings - API:
echo      * Project URL      (looks like  https://abcd.supabase.co )
echo      * anon public key  (a long "eyJhbGc..." key - the PUBLIC one,
echo        NOT the service_role key)
echo.
set "SURL="
set "SKEY="
set /p "SURL=  Paste your Project URL:  "
set /p "SKEY=  Paste your anon public key:  "
echo.
if "%SURL%"=="" ( echo   No URL entered - skipping. & goto STEP1END )
if "%SKEY%"=="" ( echo   No key entered - skipping. & goto STEP1END )

REM write the phone config (mobile/www/supabase-config.js)
set "CFG=mobile\www\supabase-config.js"
>"%CFG%" echo window.NOVA_SUPABASE = { url: "%SURL%", anonKey: "%SKEY%" };
echo   Wrote %CFG%
REM write the computer config (desktop/src/supabase-config.json) so the EXE
REM uses the SAME account + PIN as the phone, auto-synced.
set "DCFG=desktop\src\supabase-config.json"
>"%DCFG%" echo {"url":"%SURL%","anonKey":"%SKEY%"}
echo   Wrote %DCFG%
echo.
echo   Both the phone app and the computer app now point to the same
echo   Supabase project, so one account + PIN works on both and they sync.
echo.
echo   (The anon key is meant to be public and ships inside the app.
echo    NEVER paste the service_role key here.)
:STEP1END
echo.
pause
if defined ALL goto STEP2
goto MENU

REM ===================================================================
:STEP2
cls
echo   ----------------------------------------------------------
echo    STEP 2 of 7  -  Database + email confirmation
echo   ----------------------------------------------------------
echo.
echo   Two one-time things in your Supabase dashboard:
echo.
echo   A) Create the table + security rules:
echo      - I will open the file  nova-supabase.sql
echo      - In Supabase: SQL Editor - New query - paste it all - Run
echo.
echo   B) Turn OFF email confirmation (so PIN sign-up works instantly):
echo      - Supabase: Authentication - Providers - Email
echo      - Turn OFF "Confirm email" - Save
echo.
echo   Press a key to open the SQL file and the Supabase site...
pause >nul
if exist "nova-supabase.sql" start "" "nova-supabase.sql"
if not exist "nova-supabase.sql" echo   Note: nova-supabase.sql was not found next to this file.
start "" "https://supabase.com/dashboard"
echo.
echo   Done both?
pause
if defined ALL goto STEP3
goto MENU

REM ===================================================================
:STEP3
cls
echo   ----------------------------------------------------------
echo    STEP 3 of 7  -  Push to GitHub (it builds APK + EXE)
echo   ----------------------------------------------------------
echo.
where git >nul 2>nul
if not errorlevel 1 goto STEP3_GIT_OK
echo   Git is not installed. Get it from  https://git-scm.com  then
echo   run this step again.
start "" "https://git-scm.com/download/win"
echo.
pause
if defined ALL goto STEP4
goto MENU

:STEP3_GIT_OK
REM Is this folder already a git repo?
set "ISREPO="
for /f "delims=" %%r in ('git rev-parse --show-toplevel 2^>nul') do set "ISREPO=%%r"
if defined ISREPO goto STEP3_HAVE
echo   This folder is not a git repo yet. Let's create it.
echo.
set "GHURL="
set /p "GHURL=  Paste your EMPTY GitHub repo URL (https://github.com/you/Nova-PA.git):  "
if "%GHURL%"=="" ( echo   No URL - skipping this step. & pause & goto MENU )
git init
git branch -M main
git remote add origin "%GHURL%"
goto STEP3_PUSH

:STEP3_HAVE
echo   Git repo detected at:
echo     %ISREPO%

:STEP3_PUSH
echo.
echo   Committing and pushing everything...
git add -A
git commit -m "Nova update" 2>nul
git push -u origin main
if not errorlevel 1 goto STEP3_PUSHED
echo.
echo   Push was rejected (the remote already has other commits).
set "FORCE="
set /p "FORCE=  Overwrite the remote with THIS folder? (y/N):  "
if /i "%FORCE%"=="y" git push -u origin main --force

:STEP3_PUSHED
echo.
echo   Pushed. GitHub Actions is now building the APK and the EXE.
echo   Watch it on your repo's "Actions" tab (takes a few minutes).
echo.
echo   Press a key to open GitHub...
pause >nul
start "" "https://github.com"
echo.
pause
if defined ALL goto STEP4
goto MENU

REM ===================================================================
:STEP4
cls
echo   ----------------------------------------------------------
echo    STEP 4 of 7  -  Get your APK and EXE
echo   ----------------------------------------------------------
echo.
echo   When the green check appears on the Actions run:
echo.
echo   1) Open your repo - Releases (right side) - the "latest" release.
echo   2) You'll see:
echo         Nova.apk         (install on Android phones/tablets)
echo         Nova-Setup.exe   (install on Windows)
echo   3) For the download WEBSITE to work for everyone, make the repo
echo      PUBLIC:  repo - Settings - General - Danger Zone -
echo      Change visibility - Public.
echo   4) Download  Nova.apk  (you'll drop it into the website folder).
echo      The EXE stays on the Release - the website links straight to it.
echo.
pause
if defined ALL goto STEP5
goto MENU

REM ===================================================================
:STEP5
cls
echo   ----------------------------------------------------------
echo    STEP 5 of 7  -  Download website on Vercel
echo   ----------------------------------------------------------
echo.
echo   1) Put the  Nova.apk  you downloaded into your  nova-site-repo
echo      folder, named exactly  Nova.apk . Delete the placeholder .txt.
echo   2) In  nova-site-repo/index.html  check the Windows button points
echo      to YOUR repo's release (replace the username if needed):
echo         github.com/YOUR-USER/Nova-PA/releases/latest/download/Nova-Setup.exe
echo   3) Push  nova-site-repo  to its own GitHub repo (e.g. nova-site):
echo         git init
echo         git add .
echo         git commit -m "Nova download site"
echo         git branch -M main
echo         git remote add origin https://github.com/YOUR-USER/nova-site.git
echo         git push -u origin main
echo   4) On vercel.com:  Add New - Project - Import  nova-site  -
echo      Framework "Other" - Deploy. You get a link like
echo      https://nova-site.vercel.app  - that's your download page.
echo.
echo   Press a key to open Vercel...
pause >nul
start "" "https://vercel.com/new"
echo.
pause
if defined ALL goto STEP6
goto MENU

REM ===================================================================
:STEP6
cls
echo   ----------------------------------------------------------
echo    STEP 6 of 7  -  ElevenLabs voice (natural speech)
echo   ----------------------------------------------------------
echo.
echo   This is set INSIDE the desktop app - nothing to install here.
echo.
echo   1) Make a free account at  https://elevenlabs.io
echo   2) Profile - "API key" - copy your key (starts with sk_ or xi-).
echo   3) Open Nova on your PC - Settings - Voice.
echo   4) Switch the voice engine to  "ElevenLabs (natural)".
echo   5) Paste the API key, click  "Load voices", pick a voice, Save.
echo.
echo   Nova will then read chat replies and the desktop avatar aloud in
echo   that voice. It stays silent until you add a key, and falls back to
echo   the free Windows voice automatically. The key is stored encrypted
echo   on your PC and only ever goes to ElevenLabs.
echo.
echo   Press a key to open the ElevenLabs API-keys page...
pause >nul
start "" "https://elevenlabs.io/app/settings/api-keys"
echo.
pause
if defined ALL goto STEP7
goto MENU

REM ===================================================================
:STEP7
cls
echo   ----------------------------------------------------------
echo    STEP 7 of 7  -  Build the Windows EXE on THIS PC (optional)
echo   ----------------------------------------------------------
echo.
echo   You usually DON'T need this - GitHub already built the EXE in
echo   step 3. Use this only if you want to build it yourself.
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js is not installed. Get the LTS from  https://nodejs.org
  echo   then run this step again.
  start "" "https://nodejs.org/en/download"
  echo.
  pause
  goto AFTER7
)
echo   Node found:
node -v
echo.
set "DOBUILD="
set /p "DOBUILD=  Build the EXE now? This downloads packages (y/N):  "
if /i not "%DOBUILD%"=="y" goto AFTER7
pushd desktop
echo.
echo   Installing packages...
call npm install
echo.
echo   Building the installer and portable EXE...
call npm run dist
echo.
echo   Done. Look in  desktop\dist\  for:
echo      Nova-Setup.exe      (installer)
echo      Nova-...-portable.exe
echo.
echo   Tip: if you see a "symbolic link / privilege" error, close this,
echo   right-click this .bat and choose "Run as administrator", or turn
echo   on Windows Developer Mode (Settings - For developers), then retry.
popd
:AFTER7
echo.
pause
goto MENU

REM ===================================================================
:END
cls
echo.
echo   All set. Quick recap:
echo     - Supabase connected and database ready
echo     - GitHub builds the APK + EXE on every push
echo     - Website on Vercel serves both downloads
echo     - ElevenLabs voice set inside the app
echo.
echo   You can re-run this guide any time.
echo.
pause
endlocal
exit /b 0
