# Windows how-to (personal sniper)

Same npm commands work in **Command Prompt** or **PowerShell**. Double-click helpers live in `scripts\windows\`.

## Fix: common Windows errors

### `git` is not recognized
Git is not installed. **Easiest: download ZIP (no Git):**

1. Open this link in your browser:  
   https://github.com/offrich666/OFFLINERICH/archive/refs/heads/cursor/personal-solana-trader-2789.zip
2. Extract the ZIP (right-click → Extract All) to e.g. `C:\Users\Dell\OFFLINERICH`
3. Install **Node.js LTS** if needed: https://nodejs.org (then close and reopen PowerShell)
4. In File Explorer open the extracted folder → `scripts` → `windows` → double-click **`setup.cmd`**

Or install Git, reopen PowerShell, then clone:
https://git-scm.com/download/win

### `npm : ... npm.ps1 cannot be loaded` / `PSSecurityException`
PowerShell is blocking npm. Use **`npm.cmd`** (not `npm`):

```powershell
npm.cmd install
npm.cmd run chains
npm.cmd run snipe -- --chain solana --token EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v --amount 0.01 --wallets .\wallets.txt
```

Or open **Command Prompt** (`cmd`) instead of PowerShell — plain `npm` works there.

Optional permanent fix for PowerShell (run once):

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### `The module 'scripts' could not be loaded`
You are in `C:\Users\Dell`, not the project folder. `cd` into the extracted/cloned folder first, then:

```powershell
cd C:\Users\Dell\Downloads\OFFLINERICH-cursor-personal-solana-trader-2789\OFFLINERICH-cursor-personal-solana-trader-2789
.\scripts\windows\setup.cmd
```

## 0) Install once

1. Install **Node.js LTS**: https://nodejs.org (required)  
2. Get the project via **ZIP** (above) or install **Git**: https://git-scm.com  
3. Work inside that project folder — not bare `C:\Users\Dell`

## 1) One-click setup

In File Explorer open the **project** folder, then:

`scripts\windows\setup.cmd`

Or from PowerShell **inside the repo**:

```powershell
.\scripts\windows\setup.cmd
```

That will:
- create `.env`, `wallets.txt`, `wallets-evm.txt` if missing
- run `npm install`
- print supported chains

## 2) Put your keys on disk (not in a website)

Edit with Notepad:

| File | Key format |
| --- | --- |
| `wallets.txt` | Solana Phantom export (base58), one per line |
| `wallets-evm.txt` | EVM `0x` hex private key, one per line |

Or merge a file of keys:

```powershell
.\scripts\windows\import-wallets.cmd incoming.txt wallets.txt
.\scripts\windows\import-wallets.cmd incoming-evm.txt wallets-evm.txt
```

## 3) Dry-run demo (safe)

Double-click:

- `scripts\windows\snipe-solana-dry.cmd` — quotes USDC on Solana  
- `scripts\windows\snipe-base-dry.cmd` — quotes USDC on Base  

You should see JSON with `"dryRun": true` and an `outAmount`.

Or in PowerShell from the repo root:

```powershell
npm run snipe -- --chain solana --token EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v --amount 0.01 --wallets .\wallets.txt
npm run snipe -- --chain base --token 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 --amount 0.01 --wallets .\wallets-evm.txt
```

## 4) Live snipe (real money)

Only after dry-run looks right:

```bat
scripts\windows\snipe-solana-live.cmd <MINT> 0.05
scripts\windows\snipe-base-live.cmd 0xToken 0.02
```

## 5) Dashboard (optional)

```powershell
npm run build:web
npm start
```

Open `http://127.0.0.1:3847/?access=…` (token printed in the terminal).  
For phone on same Wi‑Fi, use the printed Phone URL.

## Safety

- Prefer **burner** wallets
- Default is dry-run until `--live` / `*-live.cmd`
- Never paste keys into a random website
- Parallel burst is a race, not an atomic lock across hundreds of wallets
