# OFFLINERICH — pay $10–$9,000 → crypto to client wallet

## Important: what Stripe sends you

When a client pays **$10** (or any amount) with card / Apple Pay / Google Pay:

- You receive **USD in Stripe** (G N LABS LLC balance) — **not crypto**
- Stripe does **not** auto-send crypto to your treasury or to the client
- You (ops) convert / fund treasury, then send crypto treasury → client wallet
- Track jobs at `/ops/transfers?key=$OPS_SECRET`

Crypto Onramp (separate Stripe product, needs application) can mint crypto to a wallet; this checkout path is **fiat Checkout → manual crypto send**.

## Client flow

1. Amount **$10–$9,000**
2. Network + their wallet
3. Pay with card / Apple Pay / Google Pay
4. After payment, crypto is delivered to that wallet (ops from treasury)

## Live Stripe

| | |
| --- | --- |
| Flexible price | `price_1UVgRDQWCzdANStksBqKZ5BL` ($10–$9,000) |
| Payment Link | https://buy.stripe.com/aFafZj4TvdLq8WAboDds408 |
| Account | `acct_1UCk64QWCzdANStk` |

## Run

```bash
npm install --legacy-peer-deps
cp .env.example .env.local
npm run dev
```
