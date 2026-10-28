# OFFLINERICH × Crossmint Onramp

Buy USDC in-app with **card**, **Apple Pay**, and **Google Pay** via [Crossmint Onramp](https://docs.crossmint.com/onramp/overview).

## Quick start

```bash
npm install
cp .env.example .env.local
# add client + server API keys
npm run dev
```

Open [http://localhost:3000/checkout](http://localhost:3000/checkout).

## Routes

| Path | Purpose |
| --- | --- |
| `/` | Brand landing |
| `/checkout` | USDC onramp (primary) |
| `/drop` | Optional NFT collection checkout |
| `GET /api/crossmint/health` | Keys + onramp readiness |
| `POST /api/onramp/orders` | Create onramp order |
| `GET /.well-known/apple-developer-merchantid-domain-association` | Apple Pay domain file |

## Payment methods

Embedded checkout enables:

```ts
fiat: {
  enabled: true,
  allowedMethods: { card: true, applePay: true, googlePay: true },
}
```

### Apple Pay (web)

1. Download the verification file from Crossmint Console → **Apple Pay Domains**
2. Put contents in `APPLE_PAY_DOMAIN_ASSOCIATION` **or** save as  
   `public/.well-known/apple-developer-merchantid-domain-association`
3. Deploy on **HTTPS**
4. Verify the domain in Crossmint Console
5. Test in **Safari** (macOS / iOS)

Google Pay on web needs no extra domain setup.

## Production gate

Crossmint Onramp on **production** requires a signed Order Form + KYB. Staging is self-serve.

If health/checkout returns:

> Onramp is not yet enabled for production use…

then either:

- switch to **staging** keys (`ck_staging_` / `sk_staging_`, `NEXT_PUBLIC_CROSSMINT_ENV=staging`), or
- contact [Crossmint Sales](https://www.crossmint.com/contact/sales) to enable production

## API key scopes

Server key: `orders.create`, `orders.read`, `wallets.create`  
Client key: whitelist your origins + checkout scopes used by embedded UI

## Scripts

```bash
npm run dev
npm run build
npm run setup:collection   # optional NFT collection helper
```
