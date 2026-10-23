@echo off
setlocal EnableExtensions
cd /d "%~dp0..\.."

echo.
echo === Personal sniper setup (Windows) ===
echo Working dir: %CD%
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js not found.
  echo Install LTS from https://nodejs.org then CLOSE this window and open a NEW PowerShell.
  echo.
  pause
  exit /b 1
)

echo Node:
node -v
ver >nul

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm not found. Reinstall Node.js LTS and reopen the terminal.
  echo.
  pause
  exit /b 1
)

echo npm:
call npm -v
ver >nul

echo.
echo [1/4] Creating .env / wallet files if missing...
if not exist ".env" (
  copy /Y ".env.example" ".env"
  echo   created .env
) else (
  echo   .env already exists
)

if not exist "wallets.txt" (
  copy /Y "wallets.example.txt" "wallets.txt"
  echo   created wallets.txt
) else (
  echo   wallets.txt already exists
)

if not exist "wallets-evm.txt" (
  copy /Y "wallets-evm.example.txt" "wallets-evm.txt"
  echo   created wallets-evm.txt
) else (
  echo   wallets-evm.txt already exists
)

echo.
echo [2/4] npm install (this can take 1-2 minutes)...
call npm install
if errorlevel 1 (
  echo.
  echo ERROR: npm install failed.
  echo Try manually in PowerShell:
  echo   cd /d "%CD%"
  echo   npm install
  echo.
  pause
  exit /b 1
)

echo.
echo [3/4] Listing chains...
call npm run chains
if errorlevel 1 (
  echo WARNING: npm run chains failed — packages may still be installing. Re-run setup.
)

echo.
echo [4/4] DONE.
echo Next:
echo   1. Edit wallets.txt with your Solana keys ^(Notepad^)
echo   2. Run:  .\scripts\windows\snipe-solana-dry.cmd
echo   3. Only use *-live.cmd when you mean to spend real money
echo.
pause
endlocal