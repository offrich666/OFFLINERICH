# OFFLINERICH — pay $5–$9,000 → crypto to client wallet

## Status

**Stripe Crypto Onramp is APPROVED** for G N LABS LLC (`acct_1UCk64QWCzdANStk`).

## Checkout paths (`/checkout`)

### Easy card (default) — no crypto KYC
```
Client: amount + wallet → Stripe Embedded Checkout (card / Apple Pay / Google Pay)
        │
        ▼
USD settles in Stripe (GN Labs) → ops queue paid_pending_treasury
        │
        ▼
Ops funds treasury / buys crypto → sends to clientWallet → mark sent
```

Stripe cannot auto-buy crypto for the merchant after a normal card payment
without putting the *customer* through Crypto Onramp KYC. Easy card keeps
checkout simple; crypto delivery is the ops step.

### Instant crypto — Onramp (KYC)
```
Client: amount + wallet → Stripe Crypto Onramp locked to THEIR wallet
        │
        ▼
USDC/BTC settles on-chain to the client (Stripe handles KYC)
```

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
