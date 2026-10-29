# Roadmap: Client pays $10 → you receive crypto

## Reality check

| Method | Client pays card | You receive crypto? | Status on G N LABS LLC (`acct_1UCk64QWCzdANStk`) |
| --- | --- | --- | --- |
| Stripe Checkout / Payment Link | Yes | **No** — USD only | Live today |
| **Stripe Crypto Onramp** (wallet locked to **your treasury**) | Yes | **Yes** — USDC/ETH/BTC to treasury | **Application submitted** — use **test mode** now; live after approval |
| Treasury Financial Account → convert USD→USDC → wallet | Indirect | Yes (after convert) | No financial account yet |
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
- [x] Status probe `GET /api/onramp/status`

## Phase 1 — Dashboard (in progress)

### 1a — Application — DONE

- [x] Submitted Crypto Onramp for **G N LABS LLC** (Stripe email confirmation)
- [ ] Watch status: **[Onramp onboarding](https://dashboard.stripe.com/crypto-onramp/onboarding)**

### 1b — Test mode NOW (while Stripe reviews)

Stripe explicitly allows trying the integration in **test mode** after submit.

1. Open **[Test API keys](https://dashboard.stripe.com/test/apikeys)** (toggle **Test mode** on).
2. Paste into `.env.local` / hosting:
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…`
   - `STRIPE_SECRET_KEY=sk_test_…` (or restricted `rk_test_…`)
   - `STRIPE_WEBHOOK_SECRET=whsec_…` (from `stripe listen` or Dashboard test webhook)
3. Allowlist your local/dev domain: **[Onramp domain allowlist](https://dashboard.stripe.com/crypto-onramp/allowlist-domains)**
4. Restart app → `/checkout` → Onramp UI (crypto → treasury in **test**).

### 1c — Live mode (after Stripe approves)

1. Paste **live** keys from [API keys](https://dashboard.stripe.com/apikeys)
2. Webhook → `https://YOUR_DOMAIN/api/webhooks/stripe`  
   Events: `crypto.onramp_session.updated`, `checkout.session.completed`, …

**After 1c:** real client payments deliver **crypto to your treasury**.

## Phase 2 — Already coded (activates with keys)

- Checkout prefers **Onramp → treasury** (crypto-in).
- Order row + `treasury_funded` when Onramp completes.
- BSC: Onramp funds treasury on Polygon/Base/ETH; send BSC manually (no BSC Onramp).

## Phase 3 — Optional auto treasury→client

1. Create/enable **[Treasury Financial Account](https://dashboard.stripe.com/treasury)** + USDC.
2. Enable **[Global Payouts / stablecoin to wallets](https://docs.stripe.com/global-payouts/send-money/stablecoins)** if needed.
3. Automate outbound USDC to `clientWallet` (or keep manual mark-sent in `/ops/transfers`).

## Phase 4 — Hardening

- Production domain allowlist + Apple Pay domain verification.
- Alerts when `fulfillment_complete` but no outbound tx within N hours.
- Reconcile Onramp fees vs client-facing amount.

## What you must click next

| Action | Link |
| --- | --- |
| **Paste test API keys** (unblocks crypto-in testing) | https://dashboard.stripe.com/test/apikeys |
| Check Onramp review status | https://dashboard.stripe.com/crypto-onramp/onboarding |
| Domain allowlist | https://dashboard.stripe.com/crypto-onramp/allowlist-domains |
| Live keys (after approval) | https://dashboard.stripe.com/apikeys |
| Treasury FA (Phase 3) | https://dashboard.stripe.com/treasury |

Without keys in env, `/checkout` falls back to the **USD Payment Link** (dollars, not crypto).
