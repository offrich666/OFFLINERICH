# Roadmap: Client pays $10 → you receive crypto

## Status (G N LABS LLC · `acct_1UCk64QWCzdANStk`)

| Step | Status |
| --- | --- |
| Crypto Onramp application | **APPROVED** (live + test) |
| App wiring (Onramp → treasury → ops) | **Done** |
| Live API keys in env | **Needed** — paste `pk_live_…` / `sk_live_…` |
| Domain allowlist | **Needed** |
| Webhook `crypto.onramp_session.updated` | **Needed** on your HTTPS domain |

## Architecture

```
Client pays $10–$9000 (card / Apple Pay / Google Pay)
        │
        ▼
Stripe Crypto Onramp  ──lock──►  YOUR treasury
   (EU: USDC on Ethereum, or BTC)
        │
        ▼
Ops /api/ops/transfers  ──send──►  client wallet (Polygon / Base / BSC / ETH / BTC)
```

**EU note:** Stripe Onramp does not settle USDC to Polygon/Base for EU. App funds **Ethereum** treasury for all EVM client networks, then ops sends to the client’s chosen chain.

Treasury (internal):

- EVM: `0x1dbB04Fe817A2C49DB853f2C49d29Db441355FE9`
- BTC: `bc1qly9n852q3j5csvgd59lcmazhfu74fc77x88vrj`

## Phase 0 — Done in app

- [x] Amount **$10–$9,000**
- [x] Client network + wallet (treasury hidden)
- [x] Onramp session locked to treasury (`POST /api/onramp/session`)
- [x] EU-safe settle networks (ethereum / bitcoin)
- [x] Webhook → `treasury_funded` on `fulfillment_complete`
- [x] Ops queue `/ops/transfers`
- [x] Status probe `GET /api/onramp/status`
- [x] USD Payment Link fallback

## Phase 1 — You (now that approved)

1. **[API keys](https://dashboard.stripe.com/apikeys)** → paste into Cloud Agent secrets / `.env.local`:
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_…`
   - `STRIPE_SECRET_KEY=sk_live_…` or `rk_live_…`
   - `STRIPE_WEBHOOK_SECRET=whsec_…`
2. **[Onboarding checklist](https://dashboard.stripe.com/crypto-onramp/onboarding)**
3. **[Domain allowlist](https://dashboard.stripe.com/crypto-onramp/allowlist-domains)** (your HTTPS host + localhost if testing)
4. Webhook → `https://YOUR_DOMAIN/api/webhooks/stripe`  
   Events: `crypto.onramp_session.updated`, `checkout.session.completed`, …

**After keys:** `/checkout` opens Onramp → crypto lands in treasury → mark sent in ops.

## Phase 3 — Optional auto outbound

Treasury Financial Account + Global Payouts (stablecoin to wallets), or keep manual ops.

## Links

| Action | URL |
| --- | --- |
| Live API keys | https://dashboard.stripe.com/apikeys |
| Onboarding checklist | https://dashboard.stripe.com/crypto-onramp/onboarding |
| Domain allowlist | https://dashboard.stripe.com/crypto-onramp/allowlist-domains |
