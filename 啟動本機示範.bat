@echo off
setlocal
cd /d "%~dp0"
title Seven11 Local Demo
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.14 or newer was not found. Install Node.js, then reopen this window.
  pause
  exit /b 1
)
node local-demo/start.mjs
echo.
echo The local demo server has stopped.
pause
