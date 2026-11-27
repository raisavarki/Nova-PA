@echo off
setlocal
title Free space on C: (safe cleanup)
echo This removes only re-downloadable caches. Your documents and Nova data are NOT touched.
echo.
for /f %%A in ('powershell -NoProfile -Command "[math]::Floor((Get-PSDrive C).Free/1MB)" 2^>nul') do echo Free on C: before: %%A MB
echo.
echo [1/4] npm cache (C:\Users\%USERNAME%\AppData\Local\npm-cache)
if exist "%LOCALAPPDATA%\npm-cache" rmdir /s /q "%LOCALAPPDATA%\npm-cache"
if exist "%APPDATA%\npm-cache" rmdir /s /q "%APPDATA%\npm-cache"
echo [2/4] Old Electron downloads (%LOCALAPPDATA%\electron\Cache)
if exist "%LOCALAPPDATA%\electron\Cache" rmdir /s /q "%LOCALAPPDATA%\electron\Cache"
echo [3/4] Old Nova browser caches in AppData (settings are kept)
for %%D in (Cache "Code Cache" GPUCache DawnCache DawnGraphiteCache DawnWebGPUCache Crashpad) do if exist "%APPDATA%\Nova Companion\%%~D" rmdir /s /q "%APPDATA%\Nova Companion\%%~D"
echo [4/4] Your temp folder (files in use are skipped)
del /f /s /q "%TEMP%\*" >nul 2>nul
for /d %%D in ("%TEMP%\*") do rmdir /s /q "%%D" >nul 2>nul
echo.
for /f %%A in ('powershell -NoProfile -Command "[math]::Floor((Get-PSDrive C).Free/1MB)" 2^>nul') do echo Free on C: after: %%A MB
echo.
echo Tip: old copies of Nova in your Downloads folder (nova-companion, nova-companion-v2, ...) each
echo hold ~300 MB in node_modules. Delete them once Nova runs from D:.
echo Windows "Disk Cleanup" (cleanmgr) can free a lot more.
pause
