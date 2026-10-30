# OFFLINERICH — pay $5–$9,000 → crypto to client wallet

## Status

**Stripe Crypto Onramp is APPROVED** for G N LABS LLC (`acct_1UCk64QWCzdANStk`).

## Checkout paths (`/checkout`)

### Instant crypto (default) — Onramp (KYC)
```
Client: amount + wallet → Stripe Crypto Onramp locked to THEIR wallet
        │
        ▼
USDC/BTC settles on-chain to the client (Stripe handles KYC)
```

Use this when treasury has **no** crypto inventory — Stripe creates the crypto.

### Easy card — no crypto KYC (needs treasury funding)
```
Client: amount + wallet → Stripe Embedded Checkout (card / Apple Pay / Google Pay)
        │
        ▼
USD settles in Stripe (GN Labs) → ops queue paid_pending_treasury
        │
        ▼
Ops must already have (or buy) crypto → send to clientWallet → mark sent
```

Do not use Easy card as the main path if treasury is empty.

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
