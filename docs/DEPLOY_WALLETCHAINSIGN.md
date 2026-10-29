# Deploy OFFLINERICH → www.walletchainsign.com

## Why it fails today
`www.walletchainsign.com` is on **Vercel** but serves a **different** Grok “Ledger / WalletChainSign” app.
`/checkout` returns **404** because this OFFLINERICH Next.js app is not that project.

## Fastest path (claim temp deploy + attach domain)

A built OFFLINERICH deploy is ready to claim (expires ~1h from creation):

1. Open the claim link from the agent (or recreate with `npx vercel deploy --temporary --yes`).
2. Log into the Vercel account that owns `www.walletchainsign.com`.
3. After claim → **Settings → Environment Variables** → add the table below → Redeploy.
4. **Settings → Domains** → Add `www.walletchainsign.com` → confirm **move domain** off the Grok Ledger project.
5. Stripe allowlist already has `www.walletchainsign.com`. Webhook already points at `/api/webhooks/stripe`.

## Or: Import from GitHub

1. Open [vercel.com/new](https://vercel.com/new) → Import `offrich666/OFFLINERICH`
2. Branch: `cursor/stripe-9000-client-wallet-d4e9` (or `main` after merge)
3. Framework: Next.js (auto). `.npmrc` sets `legacy-peer-deps=true`.
4. **Environment Variables** (Production) — see table.
5. Deploy → Domains → add `www.walletchainsign.com` (move from Grok project).

## Environment Variables (Production)

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | `https://www.walletchainsign.com` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_…` (G N LABS) |
| `STRIPE_SECRET_KEY` | `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | signing secret for webhook `we_1UVtdmQWCzdANStktynNULDO` |
| `STRIPE_PRICE_ID` | `price_1UVgRDQWCzdANStksBqKZ5BL` |
| `NEXT_PUBLIC_STRIPE_PAYMENT_LINK_URL` | `https://buy.stripe.com/aFafZj4TvdLq8WAboDds408` |
| `OPS_SECRET` | long random string |

Helper (after `vercel login` or `VERCEL_TOKEN`): `./scripts/push-vercel-env.sh`

## Already done in Stripe
- Onramp approved (live)
- Allowlist: `www.walletchainsign.com`, `localhost`
- Webhook: `https://www.walletchainsign.com/api/webhooks/stripe` (`we_1UVtdm…`)

## Verify
- https://www.walletchainsign.com/checkout → pay form
- https://www.walletchainsign.com/api/onramp/status → `"mode":"live"`
- Pay $10 → `/ops/transfers?key=OPS_SECRET` shows order

## Agent note
Without a `VERCEL_TOKEN` the agent cannot attach your custom domain. Paste a token from https://vercel.com/account/tokens to finish automatically.
