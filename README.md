# OFFLINERICH × Crossmint

Production checkout is wired to collection **`offlinerich-drop`** with card, Apple Pay, and Google Pay.

## Already done in this repo / project

- Treasury payout wallet created: set in `CROSSMINT_PAYOUT_ADDRESS`
- Sellable collection created: `offlinerich-drop` (Polygon, 1 USDC)
- Embedded checkout UI with Apple Pay / Google Pay / card
- Apple Pay domain association route
- USDC onramp flow at `/onramp`

## What Crossmint still blocks (cannot be fixed by code)

Production **Checkout** and **Onramp** require Crossmint **Order Form + KYB**.  
Collection also needs **content review** started in Console.

| Step | Where |
| --- | --- |
| Whitelist `http://localhost:3000` + your domain | Console → API Keys → client key |
| Start review for `offlinerich-drop` | Console → collection → Review (left sidebar) |
| Enable production payments | [Contact Sales](https://www.crossmint.com/contact/sales) |

Staging is self-serve if you want to test before KYB: use `ck_staging_` / `sk_staging_` and `NEXT_PUBLIC_CROSSMINT_ENV=staging`.

## Run

```bash
npm install
cp .env.example .env.local
npm run dev
```

- `/checkout` — paid drop (primary)
- `/onramp` — buy USDC
- `GET /api/crossmint/health` — readiness
- `GET /.well-known/apple-developer-merchantid-domain-association` — Apple Pay file

## Apple Pay

1. Download file from Console → Apple Pay Domains
2. Set `APPLE_PAY_DOMAIN_ASSOCIATION` or save under `public/.well-known/`
3. Verify HTTPS domain in Console
4. Test in Safari
