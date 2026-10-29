import { NextResponse } from "next/server";
import { getPublishableKey, isLiveStripeKey } from "@/lib/stripe";

/**
 * Lightweight readiness probe for Crypto Onramp (no Stripe network call).
 * Application submitted → use test keys to develop; live keys after approval.
 */
export async function GET() {
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
      note: "Fiat-to-crypto onramp application submitted — try test mode while Stripe reviews.",
    },
    keys: {
      secretPresent: hasSecret,
      publishablePresent: hasPublishable,
      mode,
    },
    readyForOnrampUi: hasSecret && hasPublishable,
    nextSteps:
      hasSecret && hasPublishable
        ? [
            "Create a session via POST /api/onramp/session",
            "Add your domain to Onramp allowlist in Dashboard",
            "Register webhook crypto.onramp_session.updated",
          ]
        : [
            "Open https://dashboard.stripe.com/test/apikeys (Test mode)",
            "Paste NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_… and STRIPE_SECRET_KEY=sk_test_… into .env.local / hosting",
            "Restart the app, then pay on /checkout — crypto settles to treasury in test",
          ],
    links: {
      onboarding: "https://dashboard.stripe.com/crypto-onramp/onboarding",
      testApiKeys: "https://dashboard.stripe.com/test/apikeys",
      liveApiKeys: "https://dashboard.stripe.com/apikeys",
      domainAllowlist: "https://dashboard.stripe.com/crypto-onramp/allowlist-domains",
      roadmap: "/docs/CRYPTO_RECEIVE_ROADMAP.md",
    },
  });
}
