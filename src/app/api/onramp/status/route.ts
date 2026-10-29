import { connection } from "next/server";
import { NextResponse } from "next/server";
import { getPublishableKey, isLiveStripeKey } from "@/lib/stripe";

export const instant = false;

/**
 * Readiness probe for Crypto Onramp (no Stripe network call).
 * Application APPROVED — live + test keys unlock crypto-to-treasury.
 */
export async function GET() {
  await connection();
  const secret = process.env.STRIPE_SECRET_KEY || "";
  const publishable = getPublishableKey();
  const hasSecret = Boolean(secret);
  const hasPublishable = Boolean(publishable);
  const live = isLiveStripeKey(secret) || isLiveStripeKey(publishable);
  const mode = !hasSecret && !hasPublishable ? "unconfigured" : live ? "live" : "test";

  return NextResponse.json({
    application: {
      account: "acct_1UCk64QWCzdANStk",
      business: "G N LABS LLC",
      submitted: true,
      approved: true,
      note: "Crypto Onramp approved — integrate in test and live mode. Paste API keys to mint sessions.",
    },
    keys: {
      secretPresent: hasSecret,
      publishablePresent: hasPublishable,
      mode,
    },
    readyForOnrampUi: hasSecret && hasPublishable,
    settleNetworks: ["ethereum", "bitcoin"],
    settleNote:
      "EU Onramp settles USDC to Ethereum treasury (not Polygon/Base). Ops then sends to client network.",
    nextSteps:
      hasSecret && hasPublishable
        ? [
            "Domain allowlist done (www.walletchainsign.com + localhost)",
            "Deploy this app to https://www.walletchainsign.com so /checkout is live",
            "Webhook → https://www.walletchainsign.com/api/webhooks/stripe (crypto.onramp_session.updated, checkout.session.completed)",
            "Finish checklist: https://dashboard.stripe.com/crypto-onramp/onboarding",
            "Pay on /checkout — crypto locks to treasury, then ops sends to client wallet",
          ]
        : [
            "Open https://dashboard.stripe.com/apikeys (Live mode)",
            "Paste NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_… and STRIPE_SECRET_KEY=sk_live_… (or rk_live_…)",
            "Restart the app / re-run agent after secrets are saved",
            "Allowlist your domain, then pay on /checkout",
          ],
    links: {
      onboarding: "https://dashboard.stripe.com/crypto-onramp/onboarding",
      liveApiKeys: "https://dashboard.stripe.com/apikeys",
      testApiKeys: "https://dashboard.stripe.com/test/apikeys",
      domainAllowlist: "https://dashboard.stripe.com/crypto-onramp/allowlist-domains",
      roadmap: "/docs/CRYPTO_RECEIVE_ROADMAP.md",
    },
  });
}
