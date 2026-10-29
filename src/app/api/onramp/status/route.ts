import { connection } from "next/server";
import { NextResponse } from "next/server";
import { getPublishableKey, isLiveStripeKey } from "@/lib/stripe";

async function probePublishableKey(publishable: string): Promise<{
  valid: boolean;
  error?: string;
}> {
  if (!publishable) return { valid: false, error: "missing" };
  try {
    const res = await fetch("https://api.stripe.com/v1/tokens", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${publishable}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        "card[number]": "4242424242424242",
        "card[exp_month]": "12",
        "card[exp_year]": "34",
        "card[cvc]": "123",
      }),
      cache: "no-store",
    });
    if (res.ok) return { valid: true };
    const data = (await res.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    return {
      valid: false,
      error: data?.error?.message || `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : "probe_failed",
    };
  }
}

/**
 * Readiness probe for Crypto Onramp.
 * Also validates the publishable key — invalid pk_live breaks the Onramp iframe.
 */
export async function GET() {
  await connection();
  const secret = process.env.STRIPE_SECRET_KEY || "";
  const publishable = getPublishableKey();
  const hasSecret = Boolean(secret);
  const hasPublishable = Boolean(publishable);
  const live = isLiveStripeKey(secret) || isLiveStripeKey(publishable);
  const mode = !hasSecret && !hasPublishable ? "unconfigured" : live ? "live" : "test";
  const publishableProbe = await probePublishableKey(publishable);

  return NextResponse.json({
    application: {
      account: "acct_1UCk64QWCzdANStk",
      business: "G N LABS LLC",
      submitted: true,
      approved: true,
      note: "Crypto Onramp approved — integrate in test and live mode.",
    },
    keys: {
      secretPresent: hasSecret,
      publishablePresent: hasPublishable,
      publishableValid: publishableProbe.valid,
      publishableError: publishableProbe.error ?? null,
      mode,
    },
    readyForOnrampUi: hasSecret && hasPublishable && publishableProbe.valid,
    paymentMethods: {
      card: true,
      applePay:
        "Active on payment_method_domains for www.walletchainsign.com (Safari/iOS). Crypto Onramp may also need Stripe to enable Apple Pay on the account.",
      googlePay:
        "Active on payment_method_domains for www.walletchainsign.com (Chrome/Android).",
      samsungPay: "Uses Google Pay on Android Chrome — no separate Stripe button.",
    },
    settleNetworks: ["ethereum", "bitcoin"],
    settleNote:
      "EU Onramp settles USDC to Ethereum treasury (not Polygon/Base). Ops then sends to client network.",
    nextSteps: !publishableProbe.valid
      ? [
          "Publishable key is INVALID — open https://dashboard.stripe.com/apikeys (Live)",
          "Click Reveal/copy on Publishable key (pk_live_…), full string (~107 chars)",
          "Vercel → offlinerich → Settings → Environment Variables → update NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
          "Redeploy Production, then reload /checkout",
        ]
      : hasSecret && hasPublishable
        ? [
            "Pay on https://www.walletchainsign.com/checkout — stay on page",
            "Webhook already: https://www.walletchainsign.com/api/webhooks/stripe",
            "If Apple Pay missing in Onramp widget, ask Stripe sales to enable Apple Pay for Crypto Onramp",
          ]
        : [
            "Paste live pk_live_ / sk_live_ into Vercel env and redeploy",
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
