@echo off
setlocal
cd /d "%~dp0..\.."

REM Dry-run Solana snipe (quote only). Edit TOKEN / AMOUNT as needed.
set "TOKEN=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
set "AMOUNT=0.01"
set "WALLETS=wallets.txt"

echo DRY-RUN Solana snipe
echo token=%TOKEN% amount=%AMOUNT% wallets=%WALLETS%
echo.

call npm run snipe -- --chain solana --token %TOKEN% --amount %AMOUNT% --wallets %WALLETS%
echo.
pause
endlocal