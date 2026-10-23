@echo off
setlocal
cd /d "%~dp0..\.."

echo WARNING: LIVE mode spends real SOL from every key in wallets.txt
echo Press Ctrl+C to cancel, or
pause

set "TOKEN=%~1"
set "AMOUNT=%~2"
if "%TOKEN%"=="" (
  echo Usage: snipe-solana-live.cmd ^<MINT^> ^<SOL_AMOUNT^>
  echo Example: snipe-solana-live.cmd SoMeMint111 0.05
  exit /b 1
)
if "%AMOUNT%"=="" set "AMOUNT=0.05"

call npm run snipe -- --chain solana --token %TOKEN% --amount %AMOUNT% --wallets wallets.txt --live
echo.
pause
endlocal