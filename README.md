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
# Stripe Instant pay: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY + STRIPE_SECRET_KEY (live)
# Crossmint USDC onramp: CROSSMINT_SERVER_API_KEY + NEXT_PUBLIC_CROSSMINT_API_KEY
npm run dev
```

- Checkout (Stripe Instant): `/checkout`
- Crossmint USDC onramp: `/onramp` — card / Apple Pay / Google Pay → USDC to wallet
- Crossmint health: `GET /api/crossmint/health`
- Ops: `/ops/transfers?key=$OPS_SECRET`
- Status: `GET /api/onramp/status`
- Babyphone (anywhere): `/babyphone` — nursery Camera + parent Remoter; works across networks via the public site URL (not same-Wi‑Fi only). Optional local HTTPS: `npm run babyphone`

Production Crossmint card onramp requires sales enablement (`crossmint.com/contact/sales`). Wallets + staging work with the same integration.
