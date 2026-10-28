# OFFLINERICH — $9,000 pay → crypto to client wallet

Client experience (no treasury mentioned):

1. Choose network + paste **their** wallet  
2. Pay **$9,000** with **card / Apple Pay / Google Pay** (Stripe)  
3. After payment, crypto is delivered to that wallet  

Internal flow (ops only):

1. Stripe collects USD on **G N LABS LLC**  
2. Crypto is funded into the **treasury**  
3. Ops sends treasury → client wallet and marks the job in `/ops/transfers`

## Live Stripe

| | |
| --- | --- |
| Price | `price_1UVgMyQWCzdANStkyBrFVqwR` ($9,000) |
| Payment Link | https://buy.stripe.com/4gM4gB4TvfTyegU2S7ds407 |
| Account | `acct_1UCk64QWCzdANStk` (G N LABS LLC) |

Payment Link already collects **network** + **wallet** and supports Apple Pay / Google Pay / card on `buy.stripe.com`.

## Env

```bash
cp .env.example .env.local
# Optional embedded checkout on your domain:
# NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
# STRIPE_SECRET_KEY=rk_live_...
# STRIPE_WEBHOOK_SECRET=whsec_...
OPS_SECRET=...
```

Without live keys, `/checkout` validates wallet then opens the **live Payment Link**.

## Ops queue

```
/ops/transfers?key=$OPS_SECRET
```

Shows paid orders with client wallet + internal treasury address. Mark sent with outbound tx hash after you transfer.

## Run

```bash
npm install --legacy-peer-deps
npm run dev
```
