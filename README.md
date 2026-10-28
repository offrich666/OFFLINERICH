# OFFLINERICH — pay $10–$9,000 → you receive crypto → client wallet

## Goal

Client pays **$10–$9,000** (card / Apple Pay / Google Pay). **You** receive crypto in your treasury. Ops then sends treasury → the client’s wallet (client never sees treasury).

Full roadmap: [`docs/CRYPTO_RECEIVE_ROADMAP.md`](docs/CRYPTO_RECEIVE_ROADMAP.md)

## How crypto-in works

| Path | Client pays | You receive | When |
| --- | --- | --- | --- |
| **Stripe Crypto Onramp** (preferred) | Card / Apple / Google | **Crypto** locked to treasury | After Onramp approval + live keys |
| USD Checkout / Payment Link (fallback) | Card / Apple / Google | **USD** in Stripe | Live today |

```
Client pays $10–$9000
        │
        ▼
Stripe Crypto Onramp  ──lock──►  YOUR treasury (EVM / BTC)
        │
        ▼
/ops/transfers  ──send──►  client wallet
```

Treasury (internal only):

- EVM (ETH / Polygon / Base / BSC sends): `0x1dbB04Fe817A2C49DB853f2C49d29Db441355FE9`
- Bitcoin: `bc1qly9n852q3j5csvgd59lcmazhfu74fc77x88vrj`

## What you must do in Stripe Dashboard (agent cannot)

1. Apply: https://dashboard.stripe.com/crypto-onramp/get-started  
2. Paste live keys into env (`pk_live_…`, `rk_live_…` / `sk_live_…`, `whsec_…`)  
3. Webhook → `https://YOUR_DOMAIN/api/webhooks/stripe`  
   Events: `crypto.onramp_session.updated`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`

Until Onramp is approved, `/checkout` falls back to the USD Payment Link so clients can still pay.

## Live Stripe (USD fallback)

| | |
| --- | --- |
| Flexible price | `price_1UVgRDQWCzdANStksBqKZ5BL` ($10–$9,000) |
| Payment Link | https://buy.stripe.com/aFafZj4TvdLq8WAboDds408 |
| Account | `acct_1UCk64QWCzdANStk` (G N LABS LLC) |

## Run

```bash
npm install --legacy-peer-deps
cp .env.example .env.local
npm run dev
```

- Client checkout: `/checkout`
- Ops queue: `/ops/transfers?key=$OPS_SECRET`
