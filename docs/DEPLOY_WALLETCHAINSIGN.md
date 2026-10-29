# Deploy OFFLINERICH → www.walletchainsign.com (Njalla + Grok)

## What’s wrong now
- Registrar/DNS: **Njalla** (`1-you.njalla.no`, `2-can.njalla.in`, `3-get.njalla.fo`)
- `www` still **CNAME → `c1b1aec43a37291d.vercel-dns-016.com`** (Grok App Builder publish — Ledger app)
- That is **not** your personal Vercel project and **not** this OFFLINERICH repo
- `/checkout` → **404**

## Fix (agent can do this with secrets)

1. **Grok** → open the WalletChainSign / Ledger project → remove custom domain `www.walletchainsign.com` (stops Grok reclaiming DNS).
2. Add Cloud secrets:
   - `NJALLA_API_TOKEN` — https://njal.la/ → Settings → API  
     methods: `list-records`, `add-record`, `edit-record`, `remove-record`, `list-domains`
   - `VERCEL_TOKEN` — https://vercel.com/account/tokens (deploy OFFLINERICH)
3. Agent will:
   - Deploy OFFLINERICH to Vercel with live Stripe env
   - Run `scripts/njalla-point-walletchainsign.sh <vercel-cname-target>`
   - Confirm https://www.walletchainsign.com/checkout

Manual DNS (if you edit Njalla yourself):

| Type | Name | Content |
| --- | --- | --- |
| CNAME | `www` | `<your-offlinerich-project>.vercel-dns.com` (exact target from Vercel Domains UI) |

## Stripe (already done)
- Onramp approved (live)
- Allowlist: `www.walletchainsign.com`, `localhost`
- Webhook: `https://www.walletchainsign.com/api/webhooks/stripe`

## Env on the host that serves the domain
`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `NEXT_PUBLIC_STRIPE_PAYMENT_LINK_URL`, `OPS_SECRET`
