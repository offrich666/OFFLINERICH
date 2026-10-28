# OFFLINERICH

Next.js storefront with **Crossmint** embedded checkout (card + crypto).

## Quick start

```bash
npm install
cp .env.example .env.local
# fill in Crossmint keys + collection id
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_CROSSMINT_API_KEY` | browser | Client key (`ck_…`) |
| `CROSSMINT_SERVER_API_KEY` | server only | Server key (`sk_…`) for `/api/*` |
| `NEXT_PUBLIC_CROSSMINT_COLLECTION_ID` | browser | Sellable collection id |
| `NEXT_PUBLIC_CROSSMINT_PRICE` | browser | Checkout price |
| `CROSSMINT_PAYOUT_ADDRESS` | scripts | Wallet that receives sales |
| `CROSSMINT_API_BASE` | server | Default production API base |

Never commit `.env.local`. Rotate any key that was pasted into chat or a ticket.

## Create a sellable collection

Your Crossmint project starts with `default-polygon` / `default-solana` (no payments). Create a paid drop:

1. Put your payout wallet in `CROSSMINT_PAYOUT_ADDRESS`
2. Run `npm run setup:collection`
3. Whitelist `http://localhost:3000` (and your production domain) on the **client** API key in [Crossmint Console](https://www.crossmint.com/console)
4. Confirm the client key has `orders.create` scope
5. Production payments may require Crossmint account / collection verification — contact Crossmint Sales if checkout is blocked on prod

## Useful routes

- `/` — brand landing
- `/checkout` — embedded Crossmint checkout
- `GET /api/crossmint/health` — key + collection diagnostic
- `POST /api/orders` — server-side order create `{ "email": "you@example.com" }`

## Scripts

```bash
npm run dev
npm run build
npm run setup:collection
```
