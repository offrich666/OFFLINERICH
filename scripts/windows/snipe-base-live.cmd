@echo off
setlocal
cd /d "%~dp0..\.."

echo WARNING: LIVE mode spends real ETH on Base from every key in wallets-evm.txt
echo Press Ctrl+C to cancel, or
pause

set "TOKEN=%~1"
set "AMOUNT=%~2"
if "%TOKEN%"=="" (
  echo Usage: snipe-base-live.cmd ^<0xTOKEN^> ^<ETH_AMOUNT^>
  echo Example: snipe-base-live.cmd 0xTokenAddress 0.02
  exit /b 1
)
if "%AMOUNT%"=="" set "AMOUNT=0.02"

call npm run snipe -- --chain base --token %TOKEN% --amount %AMOUNT% --wallets wallets-evm.txt --live
echo.
pause
endlocal