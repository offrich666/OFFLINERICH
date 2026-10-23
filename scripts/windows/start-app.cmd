@echo off
setlocal EnableExtensions
cd /d "%~dp0..\.."

echo.
echo === Start Local Sol Trader (Windows app) ===
echo Folder: %CD%
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Install Node.js LTS from https://nodejs.org then reopen this window.
  pause
  exit /b 1
)

if not exist ".env" copy /Y ".env.example" ".env" >nul
if not exist "wallets.txt" copy /Y "wallets.example.txt" "wallets.txt" >nul
if not exist "wallets-evm.txt" copy /Y "wallets-evm.example.txt" "wallets-evm.txt" >nul

echo Cleaning broken node_modules (fixes EPERM / missing tsx)...
if exist node_modules rmdir /s /q node_modules 2>nul
if exist package-lock.json del /f /q package-lock.json 2>nul

echo.
echo Installing packages (use npm.cmd for PowerShell safety)...
call npm.cmd install
if errorlevel 1 (
  echo npm install failed. Close antivirus/OneDrive locks and retry.
  pause
  exit /b 1
)

echo.
echo Building web UI...
call npm.cmd run build:web
if errorlevel 1 (
  echo build failed
  pause
  exit /b 1
)

echo.
echo Starting app...
echo When it prints a PC URL like http://127.0.0.1:3847/?access=...
echo open that link in Chrome and paste your private key in Add wallet.
echo.
call npm.cmd start

pause
endlocal