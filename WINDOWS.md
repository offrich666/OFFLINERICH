# Windows how-to (personal sniper)

Same npm commands work in **Command Prompt** or **PowerShell**. Double-click helpers live in `scripts\windows\`.

## 0) Install once

1. Install **Node.js LTS**: https://nodejs.org  
2. Install **Git** (optional): https://git-scm.com  
3. Open the project folder (clone or download this repo)

## 1) One-click setup

In File Explorer open:

`scripts\windows\setup.cmd`

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

```bat
scripts\windows\import-wallets.cmd incoming.txt wallets.txt
scripts\windows\import-wallets.cmd incoming-evm.txt wallets-evm.txt
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
