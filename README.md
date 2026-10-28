# OFFLINERICH × Stripe

Card, Apple Pay, and Google Pay via **Stripe Embedded Checkout**.

## Stripe setup (done)

| | Test (local) | Live (G N LABS LLC) |
| --- | --- | --- |
| Product | `OFFLINERICH Drop` | `prod_VWjGHH8S9tb38E` |
| Price ($1) | `price_1UVfndAcIwRSiheleztRBkx1` | `price_1UVfndQWCzdANStkYKTRQTtc` |
| Account | claimable sandbox | `acct_1UCk64QWCzdANStk` |

Local `.env.local` uses **test** keys so `4242 4242 4242 4242` works without real charges. For production, set live keys from the [Stripe Dashboard](https://dashboard.stripe.com/apikeys) and `STRIPE_PRICE_ID=price_1UVfndQWCzdANStkYKTRQTtc`.

## Run

```bash
npm install
cp .env.example .env.local   # then fill Stripe keys
npm run dev
```

In another terminal (webhooks):

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# paste the whsec_… into STRIPE_WEBHOOK_SECRET and restart next
```

- `/checkout` — Embedded Checkout
- `/checkout/return` — post-pay return page
- `POST /api/checkout/session` — creates Checkout Session (`ui_mode: embedded_page`)
- `POST /api/webhooks/stripe` — fulfills `checkout.session.completed` + `async_payment_succeeded`

## Apple Pay / Google Pay

Stripe enables wallet methods dynamically (do not hardcode `payment_method_types`). For Apple Pay on a custom domain, register the domain under Stripe Dashboard → Settings → Payment methods → Apple Pay.

## Crossmint

Legacy Crossmint onramp/collection code remains under `/onramp` and related APIs. Primary paid drop checkout is Stripe.
