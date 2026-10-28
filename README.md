# OFFLINERICH × Stripe (live treasury onramp)

Buyers pay with **card / Apple Pay / Google Pay**. Stripe Crypto Onramp converts
to crypto and delivers it to the **locked OFFLINERICH treasury wallets** (same
idea as Crossmint payout — merchant receives crypto).

## Treasury wallets

| Chain | Address |
| --- | --- |
| Ethereum / Polygon / Base (EVM) | `0x1dbB04Fe817A2C49DB853f2C49d29Db441355FE9` |
| BSC (same EVM addr; **not** on Stripe Onramp) | `0x1dbB04Fe817A2C49DB853f2C49d29Db441355FE9` |
| Bitcoin | `bc1qly9n852q3j5csvgd59lcmazhfu74fc77x88vrj` |

Stripe Onramp networks: `ethereum`, `polygon`, `base`, `bitcoin`  
Assets: `usdc`, `eth`, `btc`

## Live Stripe (G N LABS LLC)

| | Value |
| --- | --- |
| Account | `acct_1UCk64QWCzdANStk` |
| Product | `prod_VWjGHH8S9tb38E` |
| Price ($1) | `price_1UVfndQWCzdANStkYKTRQTtc` |
| Live Payment Link (fiat) | https://buy.stripe.com/eVq8wReu5cHm8WA8crds406 |

### Unlock Crypto Onramp (required for treasury crypto)

1. Submit [Crypto Onramp application](https://dashboard.stripe.com/crypto-onramp/get-started) on the live account.
2. Add live keys to `.env.local`:
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_…`
   - `STRIPE_SECRET_KEY=rk_live_…` (preferred) or `sk_live_…`
   - `STRIPE_WEBHOOK_SECRET=whsec_…`
3. Restart `npm run dev`.

Until Onramp is approved, `/checkout` still offers the **live Payment Link** (USD to Stripe). Main crypto-to-treasury path is Onramp.

## Run

```bash
npm install --legacy-peer-deps
cp .env.example .env.local   # fill live keys
npm run dev
```

Webhooks:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe \
  --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,crypto.onramp_session.updated
```

## Routes

- `/checkout` — Pay → crypto to treasury (Onramp, wallets locked)
- `/checkout/fiat` — Embedded Checkout / Payment Link (USD)
- `POST /api/onramp/session` — mint Onramp session (`lock_wallet_address: true`)
- `POST /api/checkout/session` — fiat Embedded Checkout Session
- `POST /api/webhooks/stripe` — fulfillment
