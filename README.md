# OFFLINERICH — pay $5–$9,000 → crypto to client wallet

## Status

**Stripe Crypto Onramp is APPROVED** for G N LABS LLC (`acct_1UCk64QWCzdANStk`).

Paste **live API keys** to go live:

1. https://dashboard.stripe.com/apikeys → `pk_live_…` + `sk_live_…` / `rk_live_…`
2. ~~Domain allowlist~~ — `www.walletchainsign.com` + `localhost`
3. https://dashboard.stripe.com/crypto-onramp/onboarding
4. Deploy this branch to https://www.walletchainsign.com (set live Stripe env vars on Vercel)

Roadmap: [`docs/CRYPTO_RECEIVE_ROADMAP.md`](docs/CRYPTO_RECEIVE_ROADMAP.md)

## Flow (main `/checkout`)

```
Client: amount + THEIR wallet → Stripe Crypto Onramp (card / Apple Pay / Google Pay + KYC)
        │
        ▼
USDC/BTC locked to the client's own wallet (Stripe always shows this address)
```

Why not treasury-first? Stripe’s Onramp UI always shows the locked destination
(“Confirm your wallet”). Locking to treasury inevitably exposes the treasury
address. Locking to the client’s wallet keeps that screen about *their* address
and Stripe delivers crypto directly — no pre-funded inventory needed.

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
