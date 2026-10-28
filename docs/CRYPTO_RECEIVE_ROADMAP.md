# Roadmap: Client pays $10 → you receive crypto

## Reality check

| Method | Client pays card | You receive crypto? | Status on G N LABS LLC |
| --- | --- | --- | --- |
| Stripe Checkout / Payment Link | Yes | **No** — USD only | Live today |
| **Stripe Crypto Onramp** (wallet locked to **your treasury**) | Yes | **Yes** — USDC/ETH/BTC to treasury | Code ready; **needs Onramp application + live keys** |
| Treasury Financial Account → convert USD→USDC → wallet | Indirect | Yes (after convert) | **No financial account yet** (`[]`) |
| Outside Stripe (exchange) | After bank payout | Yes | Always available |

**Target architecture (this repo):**

```
Client pays $10–$9000 (card / Apple Pay / Google Pay)
        │
        ▼
Stripe Crypto Onramp  ──lock──►  YOUR treasury wallet (crypto lands HERE)
        │
        ▼
Ops / API sends treasury ──► client wallet (client never sees treasury)
```

## Phase 0 — Done in app

- [x] Amount **$10–$9,000**
- [x] Client picks network + wallet (no treasury shown)
- [x] Live Payment Link (USD fallback)
- [x] Ops queue `/ops/transfers` for treasury→client
- [x] Onramp session API locked to treasury (`POST /api/onramp/session`)
- [x] Webhook hooks for checkout + onramp `fulfillment_complete` → `treasury_funded`

## Phase 1 — You (Dashboard) — unblock crypto-in

1. Open **[Crypto Onramp application](https://dashboard.stripe.com/crypto-onramp/get-started)** on G N LABS LLC → submit.
2. Check status: **[Onramp onboarding](https://dashboard.stripe.com/crypto-onramp/onboarding)**.
3. Add live keys to `.env.local` / hosting:
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_…`
   - `STRIPE_SECRET_KEY=rk_live_…` (or `sk_live_…`)
   - `STRIPE_WEBHOOK_SECRET=whsec_…`
4. Register webhook endpoint → `https://YOUR_DOMAIN/api/webhooks/stripe`  
   Events: `crypto.onramp_session.updated`, `checkout.session.completed`, …

**After Phase 1:** when a client pays, **crypto is delivered to your treasury** (not USD-only).

## Phase 2 — Done in code once Phase 1 clears

- Checkout prefers **Onramp → treasury** (crypto-in).
- Order row created with client wallet + `treasury_funded` when Onramp completes.
- BSC: Onramp funds treasury on Polygon/Base/ETH; you send BSC from treasury manually (Stripe Onramp has no BSC).

## Phase 3 — Optional auto treasury→client

1. Create/enable **[Treasury Financial Account](https://dashboard.stripe.com/treasury)** + USDC balance.  
   (Probe today: **0** financial accounts on this live account.)
2. Enable **[Global Payouts / stablecoin to wallets](https://docs.stripe.com/global-payouts/send-money/stablecoins)** (US except NY; request if needed).
3. Automate outbound USDC to `clientWallet` from FA (or keep manual mark-sent in `/ops/transfers`).

## Phase 4 — Hardening

- Domain allowlist for Onramp + Apple Pay domain verification on your HTTPS domain.
- Alerts when `fulfillment_complete` but no outbound tx within N hours.
- Reconcile Onramp fees vs client-facing amount.

## What you must click (cannot be done by the agent alone)

| Action | Link |
| --- | --- |
| Submit Crypto Onramp | https://dashboard.stripe.com/crypto-onramp/get-started |
| Paste live API keys into env | https://dashboard.stripe.com/apikeys |
| Enable Treasury / USDC (Phase 3) | https://dashboard.stripe.com/treasury |

Until Onramp is approved, `/checkout` still uses the **USD Payment Link** so clients can pay; you do **not** receive crypto automatically on that path.
