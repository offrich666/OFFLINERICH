# Local Sol Trader

Personal, **local-only** Solana Jupiter trader for **your** machine.

It will **not** accept private keys in the browser (no “instant import” paste UI). That pattern is how drain sites work. Bulk keys load from a **local file** only.

## Features

- Local dashboard on `http://127.0.0.1:3847`
- Single key via `PRIVATE_KEY` and/or bulk via `WALLETS_FILE` (hundreds supported, default cap 500)
- Select wallets → **burst buy** (parallel Jupiter swaps)
- `DRY_RUN=true` by default + `MAX_BUY_SOL` per wallet
- HTTP key-import endpoints return **403**

## Honest speed limits

Parallel burst is a **race**, not an atomic lock on the pool. Other traders can still land between your transactions. Bundle engines typically allow only a **handful** of txs per bundle — not 300 atomic entries. A paid private RPC helps latency; nothing guarantees “nobody between” on a public memecoin launch.

## Setup

```bash
cp .env.example .env
cp wallets.example.txt wallets.txt
# Edit wallets.txt: one base58 secret per line (your burners)
# Edit .env: WALLETS_FILE=./wallets.txt  DRY_RUN=true
npm install
npm run build:web
npm start
```

## Burst buy

1. Open the dashboard
2. Select wallets
3. Paste mint + SOL per wallet
4. **Burst buy / quote** (dry-run first)

## Security

1. Never paste secrets into a website
2. `wallets.txt` and `.env` are gitignored
3. Prefer burners with only risk capital
4. Server binds to `127.0.0.1` only

## Scripts

| Script | Purpose |
| --- | --- |
| `npm start` | Run API + UI |
| `npm run dev` | Reload server on change |
| `npm run build:web` | Build static UI |
| `npm test` | Unit tests |
| `npm run typecheck` | TypeScript check |

## Disclaimer

Meme trading is high risk. No profit guarantee. You own your keys, RPC choice, slippage, and losses.