@echo off
setlocal

rem ============================================================
rem  Bangumi Manager - one-click launcher (development mode)
rem
rem  First run installs dependencies and builds the UI.
rem  Later runs start the app directly.
rem
rem  Console messages stay ASCII on purpose: Chinese text inside a
rem  .bat file is garbled under the default Windows code page.
rem ============================================================

title Bangumi Manager
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node.js 18+ first:
  echo         https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo [1/2] First run: installing dependencies, this may take a few minutes...
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed. Check your network and retry.
    pause
    exit /b 1
  )
)

if not exist "dist\index.html" (
  echo [2/2] Building UI...
  call npm run build
  if errorlevel 1 (
    echo.
    echo [ERROR] Build failed. See the messages above.
    pause
    exit /b 1
  )
)

echo Starting Bangumi Manager...
start "" "node_modules\electron\dist\electron.exe" .
exit /b 0
