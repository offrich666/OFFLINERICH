# Funded XL — Prop Trading Firm

Professional prop firm platform: Instant, One-Step, and Two-Step challenges from **$5K to $1M**.

## Features

- Marketing site + challenge pricing
- Open registration for all traders + client login & dashboard
- Seeded legacy client with breached + locked-profit accounts (demo)
- Card checkout (processor stays off the public UI)
- Crypto USDT deposits on **Solana, BSC, and TRON** (unique merchant wallets)
- Ops admin for wallet private keys + crypto invoice confirmation

## Quick start

```bash
npm install --legacy-peer-deps
cp .env.example .env.local
# set STRIPE_SECRET_KEY, OPS_SECRET, AUTH_SECRET
npm run dev
```

- Home: `/`
- Challenges: `/challenges`
- Register: `/register` (open to everyone)
- Login: `/login`
- Dashboard: `/dashboard`
- Admin wallets (private keys): `/admin/wallets?key=$OPS_SECRET`

## Seeded client

| Field | Value |
| --- | --- |
| Email | naserademid@gmail.com |
| Password | Rina1234. |
| Accounts | 10K breached · 10K +$1,500 pending activation |
| Unlock | Buy Instant 5K ($500) to activate legacy profit |

## Payments

- **Card** → hosted checkout (server-side processor; not named on the site)
- **Crypto** → client gets a deposit address; ops confirms on `/admin/wallets`

Private keys are stored only in `data/crypto-wallets.secrets.json` (gitignored) and shown on the ops admin page.
