@echo off
rem Start PyroCade from source. Installs the dependencies the first time.
cd /d "%~dp0"

if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing PyroCade's dependencies, this only happens once...
  call npm ci
  if errorlevel 1 (
    echo.
    echo Installing failed. Make sure Node.js is installed: https://nodejs.org
    pause
    exit /b 1
  )
)

rem "start" returns right away, so this window closes while PyroCade keeps running.
start "" "node_modules\electron\dist\electron.exe" .
