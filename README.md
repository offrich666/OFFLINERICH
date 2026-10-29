# OFFLINERICH — pay $5–$9,000 → crypto to treasury → client wallet

## Status

**Stripe Crypto Onramp is APPROVED** for G N LABS LLC (`acct_1UCk64QWCzdANStk`).

Paste **live API keys** to go live:

1. https://dashboard.stripe.com/apikeys → `pk_live_…` + `sk_live_…` / `rk_live_…`
2. ~~Domain allowlist~~ — `www.walletchainsign.com` + `localhost`
3. https://dashboard.stripe.com/crypto-onramp/onboarding
4. Deploy this branch to https://www.walletchainsign.com (set live Stripe env vars on Vercel)

Roadmap: [`docs/CRYPTO_RECEIVE_ROADMAP.md`](docs/CRYPTO_RECEIVE_ROADMAP.md)

## Flow (main `/checkout` — bank cards)

Banks often block Crypto Onramp with **“not allowed merchant category.”**
Main checkout uses **regular Stripe Checkout** (business MCC, not crypto):

```
Client picks amount → Embedded Checkout (card / Apple Pay / Google Pay)
        │
        ▼
USD in Stripe (G N LABS LLC)
        │
        ▼
Ops converts / funds treasury → sends crypto to client wallet
```

Optional `/onramp` — USDC straight to treasury when the client’s card allows crypto MCC.

Treasury (internal):

- EVM: `0x1dbB04Fe817A2C49DB853f2C49d29Db441355FE9`
- BTC: `bc1qly9n852q3j5csvgd59lcmazhfu74fc77x88vrj`

## Env

```bash
npm install --legacy-peer-deps
cp .env.example .env.local
# set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY + STRIPE_SECRET_KEY (live)
npm run dev
```

- Checkout: `/checkout`
- Ops: `/ops/transfers?key=$OPS_SECRET`
- Status: `GET /api/onramp/status`

## Live Stripe (USD fallback)

| | |
| --- | --- |
| Flexible price | `price_1UVgRDQWCzdANStksBqKZ5BL` ($5–$9,000) |
| Payment Link | https://buy.stripe.com/aFafZj4TvdLq8WAboDds408 |
