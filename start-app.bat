@echo off
title Marvik Bot App
cd /d "%~dp0"
echo Starting Marvik Dashboard & Bot...
node app.js
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Application stopped with error code %ERRORLEVEL%.
    pause
)

