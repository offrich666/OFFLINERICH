@echo off
setlocal
cd /d "%~dp0..\.."

if "%~1"=="" (
  echo Usage:
  echo   import-wallets.cmd incoming.txt wallets.txt
  echo   import-wallets.cmd incoming-evm.txt wallets-evm.txt
  echo.
  echo Merges private keys from a local file into your wallet bank (disk only).
  exit /b 1
)

set "FROM=%~1"
set "TO=%~2"
if "%TO%"=="" set "TO=wallets.txt"

call npm run wallets:import -- --from "%FROM%" --to "%TO%"
echo.
pause
endlocal