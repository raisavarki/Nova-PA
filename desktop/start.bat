@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title Nova

where node >nul 2>nul || (echo Node.js 20+ is required: https://nodejs.org & pause & exit /b 1)

rem ---------------------------------------------------------------------------
rem Keep EVERYTHING on the drive this folder is on (e.g. D:), nothing on C:
rem   npm cache, Electron download cache, temp files, and Nova's own data.
rem ---------------------------------------------------------------------------
set "HERE=%~dp0"
set "npm_config_cache=%HERE%.cache\npm"
set "electron_config_cache=%HERE%.cache\electron"
set "TEMP=%HERE%.cache\tmp"
set "TMP=%HERE%.cache\tmp"
set "NOVA_DATA_DIR=%HERE%data"
if not exist "%TEMP%" mkdir "%TEMP%" >nul 2>nul

rem Already installed and complete? (path.txt is written only after a successful extract)
if exist node_modules\electron\path.txt if exist node_modules\electron\dist\electron.exe (
  findstr /c:"\"version\": \"45." node_modules\electron\package.json >nul && goto run
)

rem ---- free space check on THIS drive (skipped if Windows can't tell us)
set "FREE="
for /f %%A in ('powershell -NoProfile -NonInteractive -Command "try { [math]::Floor((Get-PSDrive -Name '%~d0'.Substring(0,1)).Free/1MB) } catch { '' }" 2^>nul') do set "FREE=%%A"
if defined FREE (
  if !FREE! GTR 0 if !FREE! LSS 600 (
    echo.
    echo  Not enough free space on drive %~d0  ^(!FREE! MB free, about 600 MB needed^).
    echo  Free some space or move this folder to a drive with more room.
    echo.
    pause & exit /b 1
  )
)

if not exist node_modules\electron\package.json goto install
findstr /c:"\"version\": \"45." node_modules\electron\package.json >nul || goto install
goto ensure

:install
echo Installing Nova on drive %~d0 (first run takes about a minute)...
if exist node_modules rmdir /s /q node_modules
if exist package-lock.json del /q package-lock.json
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 (
  echo.
  echo Install failed. If it mentions "ENOSPC" or "no space", your C: drive may be completely full:
  echo Windows itself and Node.js still need a little room on C:. Run free-c-space.bat, then try again.
  pause & exit /b 1
)

:ensure
if not exist node_modules\electron\path.txt (
  echo Downloading Electron runtime...
  if exist node_modules\electron\dist rmdir /s /q node_modules\electron\dist
  node node_modules\electron\install.js
)
if not exist node_modules\electron\path.txt (
  echo.
  echo Electron download/extract failed ^(no internet, or a drive is full^). Cleaning up partial files...
  if exist node_modules\electron\dist rmdir /s /q node_modules\electron\dist
  pause & exit /b 1
)
rem Installed: drop download caches to save space
if exist "%HERE%.cache\electron" rmdir /s /q "%HERE%.cache\electron"
if exist "%HERE%.cache\npm" rmdir /s /q "%HERE%.cache\npm"

:run
if /i "%1"=="debug" (
  node_modules\electron\dist\electron.exe .
) else (
  start "" node_modules\electron\dist\electron.exe .
)
endlocal
