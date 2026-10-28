# OFFLINERICH × Crossmint

Production checkout is wired to collection **`offlinerich-drop`** with card, Apple Pay, and Google Pay.

## Already done in this repo / project

- Payout wallet owned by **`naserademid@gmail.com`**: `0x2A787A5D845Ac9636De5E4Ab599fBB65A7B08443`
- Collection **`offlinerich-drop`** payout retargeted to that wallet (Polygon, 1 USDC)
- Embedded checkout UI with Apple Pay / Google Pay / card
- Apple Pay domain association route
- USDC onramp flow at `/onramp`
- Crossmint Support ticket submitted from **`groupgrow64@gmail.com`** requesting production Checkout/Onramp + KYB/collection review

## What still needs a human in Crossmint Console / Sales

Production **Checkout** and **Onramp** require Crossmint **Order Form + KYB**.  
Sales web form rejects `@gmail.com` — use a company domain there, or reply to the Support ticket already filed.

| Step | Where |
| --- | --- |
| Whitelist `http://localhost:3000` + your domain | Console → API Keys → client key |
| Start review for `offlinerich-drop` | Console → collection → Review (left sidebar) |
| Enable production payments | Reply to Support ticket / [Contact Sales](https://www.crossmint.com/contact/sales) with a **company** email |

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
