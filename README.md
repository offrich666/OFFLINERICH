# Local Sol Trader

Personal, **local-only** Solana meme/Jupiter trader you run on your own machine.

This is **not** a hosted multi-user bot and it will **not** accept Phantom private keys in the browser. Sites that ask you to “import wallets” on a random cloud domain are a common way to get drained.

## What you get

- Local dashboard on `http://127.0.0.1:3847`
- One wallet loaded from `.env` (`PRIVATE_KEY`)
- Jupiter buy/sell quotes and swaps
- `DRY_RUN=true` by default (quotes only until you opt into live)
- Hard `MAX_BUY_SOL` cap
- Explicit rejection of HTTP key-import endpoints

## What you do **not** get

- Guaranteed profit (no honest bot promises 1→10 SOL/day)
- Cloud custody of keys
- Multi-wallet “instant import” for other people
- Instant Pump.fun bonding-curve snipes (Jupiter routes liquid / graduated tokens; brand-new pump curves need a dedicated pump router)

## Setup

```bash
cp .env.example .env
# Edit .env: set PRIVATE_KEY (base58 Phantom export or JSON byte array)
npm install
npm run build:web
npm start
```

Open `http://127.0.0.1:3847`.

Keep `DRY_RUN=true` until a quote looks right, then set `DRY_RUN=false` for live sends.

## Security

1. Never paste your private key or seed into a website.
2. Keep `.env` out of git (already gitignored).
3. Prefer a **burner** trading wallet with only what you can lose.
4. Bind is localhost-only (`127.0.0.1`).

## Scripts

| Script | Purpose |
| --- | --- |
| `npm start` | Run API + UI |
| `npm run dev` | Reload server on change |
| `npm run build:web` | Build static UI into `dist/web` |
| `npm test` | Config unit tests |
| `npm run typecheck` | TypeScript check |

## Disclaimer

Trading meme coins is high risk. This software is for personal experimentation. You are responsible for your keys, RPC, slippage, and losses.