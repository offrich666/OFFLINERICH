import { connection } from "next/server";
import { NextResponse } from "next/server";
import { getPublishableKey, isLiveStripeKey } from "@/lib/stripe";

async function probePublishableKey(publishable: string): Promise<{
  valid: boolean;
  error?: string;
}> {
  if (!publishable) return { valid: false, error: "missing" };
  try {
    // Any authenticated Stripe response means the key string is recognized.
    // 401 Invalid API Key = bad/truncated key. 403 secret_key_required = valid pk.
    const res = await fetch("https://api.stripe.com/v1/payment_methods?limit=1", {
      headers: { Authorization: `Bearer ${publishable}` },
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as {
      error?: { message?: string; code?: string };
    } | null;
    const message = data?.error?.message || `HTTP ${res.status}`;
    if (res.status === 401 || /invalid api key/i.test(message)) {
      return { valid: false, error: message };
    }
    if (
      res.ok ||
      data?.error?.code === "secret_key_required" ||
      /secret key required/i.test(message)
    ) {
      return { valid: true };
    }
    // Other errors still imply Stripe accepted the key format/auth
    if (res.status !== 401) return { valid: true };
    return { valid: false, error: message };
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
      applePay: {
        paymentMethodDomain: "active on www.walletchainsign.com",
        onrampWidget:
          "Not guaranteed in Crypto Onramp until Stripe Sales enables Apple Pay for Onramp on this account. Domain registration alone is not enough.",
        device: "Safari on iPhone/iPad with a card in Apple Wallet",
      },
      googlePay: {
        paymentMethodDomain: "active on www.walletchainsign.com",
        device: "Chrome on Android with Google Pay set up",
      },
      cards:
        "Credit/debit via Onramp (US+EU). Banks often decline crypto on debit — try another card. Not all cards worldwide.",
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
            "Apple Pay missing in Onramp: email Stripe support/sales — enable Apple Pay for Crypto Onramp on acct_1UCk64QWCzdANStk (domains already active)",
            "Card declined: bank refused crypto charge — client must try another card (prefer credit)",
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
