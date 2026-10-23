@echo off
setlocal
cd /d "%~dp0..\.."

echo.
echo === Personal sniper setup (Windows) ===
echo Working dir: %CD%
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js not found. Install LTS from https://nodejs.org then reopen CMD.
  exit /b 1
)

node -v
npm -v

if not exist ".env" (
  copy /Y ".env.example" ".env" >nul
  echo Created .env from .env.example
)

if not exist "wallets.txt" (
  copy /Y "wallets.example.txt" "wallets.txt" >nul
  echo Created wallets.txt — put Solana base58 keys here, one per line.
)

if not exist "wallets-evm.txt" (
  copy /Y "wallets-evm.example.txt" "wallets-evm.txt" >nul
  echo Created wallets-evm.txt — put EVM 0x hex keys here, one per line.
)

echo.
echo Installing npm packages...
call npm install
if errorlevel 1 exit /b 1

echo.
echo Listing chains...
call npm run chains

echo.
echo DONE. Next:
echo   1. Edit wallets.txt / wallets-evm.txt with YOUR burner keys
echo   2. Double-click snipe-solana-dry.cmd or snipe-base-dry.cmd
echo   3. Only use *-live.cmd when you mean to spend real funds
echo.
pause
endlocal