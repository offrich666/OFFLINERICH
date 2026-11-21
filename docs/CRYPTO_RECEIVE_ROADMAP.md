# Stripe roadmap — Crypto Onramp (ACCEPTED)

**Account:** G N LABS LLC · `acct_1UCk64QWCzdANStk`  
**Product:** [Stripe Crypto Onramp](https://dashboard.stripe.com/crypto-onramp/onboarding)  
**Application status:** **ACCEPTED / APPROVED** (live + test)

This is the Stripe product roadmap we were accepted for. Buyers pay fiat; crypto settles to a locked wallet (Ethereum USDC or Bitcoin).

## Acceptance checklist

| Step | Status |
| --- | --- |
| Crypto Onramp application | **ACCEPTED** |
| Live + test mode enrollment | **Yes** |
| Domain allowlist | **Done** — `www.walletchainsign.com`, `localhost` |
| Link payments capability | **Active** |
| Card payments capability | **Active** |
| Webhook `crypto.onramp_session.updated` | `https://www.walletchainsign.com/api/webhooks/stripe` |
| App checkout | `/checkout` — card/hosted path is the reliable client pay; Onramp session API is enrolled |

## What acceptance unlocks

- Mint sessions: `POST /v1/crypto/onramp_sessions`
- Hosted Link Pay: `crypto.link.com` (`redirect_url` on each session)
- Embedded Onramp widget (`@stripe/crypto`) when Instant Pay works for the account
- Settlement networks for this EU merchant: **Ethereum (USDC)**, **Bitcoin (BTC)**
- Source currency for this merchant: **EUR** (standard settlement)

## Client pay architecture (current)

```
Buyer → /checkout
   ├─ Working path: Stripe hosted Checkout (card / wallets)
   │                 → payment clears → ops delivers crypto to wallet
   └─ Accepted Onramp: POST /api/onramp/session (enrolled)
                       → Stripe Crypto Onramp / Link Pay
                       → USDC/BTC to locked client wallet
```

**EU note:** Stripe Onramp does not settle USDC to Polygon/Base for EU. Prefer Ethereum USDC (or BTC) for direct Onramp delivery.

## App probes

- Live status JSON: `GET /api/onramp/status` (`application.approved: true`)
- Human roadmap page: `/roadmap`

## Dashboard links

| Action | URL |
| --- | --- |
| Onboarding checklist | https://dashboard.stripe.com/crypto-onramp/onboarding |
| Domain allowlist | https://dashboard.stripe.com/crypto-onramp/allowlist-domains |
| Live API keys | https://dashboard.stripe.com/apikeys |
| Test API keys | https://dashboard.stripe.com/test/apikeys |
