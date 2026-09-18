@echo off
title Marvik WhatsApp Bot
cd /d "%~dp0"
echo ===================================================
echo             Starting Marvik WhatsApp Bot
echo ===================================================
echo.
npm start
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Bot stopped with error code %ERRORLEVEL%.
    pause
)

