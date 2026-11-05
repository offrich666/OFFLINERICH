# GN Labs Crypto

Buy and sell crypto with **MoonPay Ramps** — fiat on/off ramp for GN Labs.

## Setup

```bash
npm install
cp .env.example .env.local
# paste MoonPay pk_test / sk_test / wk_test from dashboard.moonpay.com
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → **Buy** or **Sell**.

## Env

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_MOONPAY_API_KEY` | Publishable key (`pk_test_…` / `pk_live_…`) |
| `MOONPAY_SECRET_KEY` | Secret key for URL signing (`sk_test_…`) |
| `MOONPAY_WEBHOOK_KEY` | Webhook signing key (`wk_test_…`) |

## Routes

- `/` — landing
- `/ramp?mode=buy` — MoonPay buy widget
- `/ramp?mode=sell` — MoonPay sell widget
- `POST /api/moonpay/sign` — signs widget URLs when a wallet is locked
- `GET /api/moonpay/quote` — sandbox buy quote check
- `GET /api/moonpay/status` — key/mode health
- `POST /api/webhooks/moonpay` — transaction webhooks

## Sandbox

Use MoonPay test cards and test wallets from their docs. Crypto in sandbox is not real mainnet funds.
