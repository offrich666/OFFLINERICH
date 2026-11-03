# Funded XL — Prop Trading Firm

Professional prop firm platform: Instant, One-Step, and Two-Step challenges from **$5K to $1M**.

## Features

- Marketing site + challenge pricing
- Client login & trading dashboard
- Seeded legacy client with breached + locked-profit accounts
- Card checkout via **Stripe (G N LABS LLC)**
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
- Login: `/login` (seeded: `naserademid@gmail.com`)
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

- **Card** → Stripe Checkout → settles to G N LABS LLC
- **Crypto** → client gets a deposit address; ops confirms on `/admin/wallets`

Private keys are stored only in `data/crypto-wallets.secrets.json` (gitignored) and shown on the ops admin page.
