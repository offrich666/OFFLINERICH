@echo off
setlocal
cd /d "%~dp0..\.."

REM Dry-run Base snipe (quote only). Edit TOKEN / AMOUNT as needed.
set "TOKEN=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
set "AMOUNT=0.01"
set "WALLETS=wallets-evm.txt"

echo DRY-RUN Base snipe
echo token=%TOKEN% amount=%AMOUNT% wallets=%WALLETS%
echo.

call npm run snipe -- --chain base --token %TOKEN% --amount %AMOUNT% --wallets %WALLETS%
echo.
pause
endlocal