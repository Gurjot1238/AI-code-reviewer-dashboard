@echo off
title ReviewBot AI Server
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed.
  echo  Opening the download page - install the LTS version, then double-click start.bat again.
  echo.
  start https://nodejs.org/en/download
  pause
  exit /b
)

if not exist node_modules (
  echo  Installing packages - first time only, takes about a minute...
  call npm install
  if errorlevel 1 (
    echo.
    echo  npm install failed. Copy the error above and send it to Claude.
    pause
    exit /b
  )
)

echo.
echo  Starting ReviewBot AI... keep this window open while using the site.
echo  Close this window to stop the server.
echo.
start "" /min cmd /c "timeout /t 4 >nul & start http://localhost:3000"
call npm start
pause
