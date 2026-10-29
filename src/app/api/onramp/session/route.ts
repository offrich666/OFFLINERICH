import { NextResponse } from "next/server";
import {
  createTreasuryOnrampSession,
  isLiveStripeKey,
} from "@/lib/stripe";
import {
  MAX_AMOUNT_USD,
  MIN_AMOUNT_USD,
  isValidAmountUsd,
  parseAmountUsd,
} from "@/lib/networks";
import { upsertAwaitingCryptoOrder } from "@/lib/orders";

/**
 * Easy Onramp path: amount (+ optional email) only.
 * Crypto settles to OFFLINERICH treasury (locked). Client delivery wallet
 * is collected after pay via email / ops — not required to start.
 */
export async function POST(request: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        {
          error: "STRIPE_SECRET_KEY missing",
          code: "missing_keys",
          hint: "Onramp is approved — paste pk_live_/sk_live_ into env.",
        },
        { status: 503 },
      );
    }

    let amountUsd = MIN_AMOUNT_USD;
    let email = "";

    try {
      const body = (await request.json()) as {
        amountUsd?: string | number;
        email?: string;
      };
      if (body?.amountUsd != null) {
        const parsed = parseAmountUsd(body.amountUsd);
        if (parsed != null) amountUsd = parsed;
      }
      if (body?.email) email = String(body.email).trim().toLowerCase();
    } catch {
      // empty
    }

    if (!isValidAmountUsd(amountUsd)) {
      return NextResponse.json(
        {
          error: `Amount must be between $${MIN_AMOUNT_USD} and $${MAX_AMOUNT_USD}`,
        },
        { status: 400 },
      );
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
    }

    const forwarded = request.headers.get("x-forwarded-for");
    const customerIpAddress =
      forwarded?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      undefined;

    const session = await createTreasuryOnrampSession({
      customerIpAddress,
      sourceAmountUsd: amountUsd.toFixed(2),
      clientNetwork: "ethereum",
      clientWallet: "",
      clientAsset: "USDC",
      customer: email ? { email } : undefined,
    });

    if (!session.client_secret) {
      return NextResponse.json(
        { error: "Onramp session missing client_secret" },
        { status: 500 },
      );
    }

    await upsertAwaitingCryptoOrder({
      onrampSessionId: session.id,
      amountCents: Math.round(amountUsd * 100),
      currency: "usd",
      network: "ethereum",
      asset: "USDC",
      clientWallet: email
        ? `(awaiting wallet — ${email})`
        : "(awaiting wallet — contact after pay)",
    });

    return NextResponse.json({
      clientSecret: session.client_secret,
      sessionId: session.id,
      status: session.status,
      redirectUrl: session.redirect_url ?? null,
      livemode: session.livemode ?? isLiveStripeKey(),
      mode: "onramp_to_treasury",
      settlesTo: "treasury_usdc_ethereum",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create onramp session";
    console.error("[onramp/session]", message);

    const needsOnramp =
      /unrecognized request url|not.*enrolled|onramp|permission|invalid_request/i.test(
        message,
      );

    return NextResponse.json(
      {
        error: message,
        code: needsOnramp ? "onramp_not_enabled" : "onramp_error",
        applyUrl: "https://dashboard.stripe.com/crypto-onramp/get-started",
      },
      { status: needsOnramp ? 503 : 500 },
    );
  }
}
