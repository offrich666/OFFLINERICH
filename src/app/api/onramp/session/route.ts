import { NextResponse } from "next/server";
import {
  createClientOnrampSession,
  isLiveStripeKey,
} from "@/lib/stripe";
import {
  MAX_AMOUNT_USD,
  MIN_AMOUNT_USD,
  getNetwork,
  isOnrampClientNetwork,
  isValidAmountUsd,
  isValidWalletAddress,
  normalizeWalletAddress,
  parseAmountUsd,
} from "@/lib/networks";
import { upsertAwaitingCryptoOrder } from "@/lib/orders";

/**
 * Stripe Crypto Onramp session for Crossmint Onramp.
 * Returns redirectUrl (hosted Link Pay) — embed Instant Pay fails on this account.
 */
export async function POST(request: Request) {
  try {
    const secret = (process.env.STRIPE_SECRET_KEY || "").trim();
    if (
      !secret ||
      secret === "[SENSITIVE]" ||
      secret.length < 20 ||
      !(
        secret.startsWith("sk_live_") ||
        secret.startsWith("sk_test_") ||
        secret.startsWith("rk_live_") ||
        secret.startsWith("rk_test_")
      )
    ) {
      console.error("[onramp/session] STRIPE_SECRET_KEY missing or placeholder");
      return NextResponse.json(
        {
          error:
            "Stripe Onramp is not configured (invalid secret key). Use production with live Stripe keys.",
          code: "missing_keys",
        },
        { status: 503 },
      );
    }

    let amountUsd = MIN_AMOUNT_USD;
    let email = "";
    let network = "ethereum";
    let wallet = "";

    try {
      const body = (await request.json()) as {
        amountUsd?: string | number;
        email?: string;
        network?: string;
        wallet?: string;
      };
      if (body?.amountUsd != null) {
        const parsed = parseAmountUsd(body.amountUsd);
        if (parsed != null) amountUsd = parsed;
      }
      if (body?.email) email = String(body.email).trim().toLowerCase();
      if (body?.network) network = String(body.network).trim().toLowerCase();
      if (body?.wallet) wallet = String(body.wallet).trim();
    } catch {
      // empty
    }

    wallet = normalizeWalletAddress(network, wallet);

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

    if (!isOnrampClientNetwork(network)) {
      return NextResponse.json(
        { error: "Choose Ethereum or Bitcoin" },
        { status: 400 },
      );
    }

    const net = getNetwork(network);
    if (!net || !isValidWalletAddress(network, wallet)) {
      return NextResponse.json(
        {
          error:
            network === "bitcoin"
              ? "Enter a valid Bitcoin address"
              : "Enter a valid wallet address (0x…)",
        },
        { status: 400 },
      );
    }

    const forwarded = request.headers.get("x-forwarded-for");
    const customerIpAddress =
      forwarded?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      undefined;

    const origin = (() => {
      const hdr = request.headers.get("origin");
      if (hdr) return hdr.replace(/\/$/, "");
      try {
        return new URL(request.url).origin;
      } catch {
        return (
          process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
          "https://www.walletchainsign.com"
        );
      }
    })();

    const session = await createClientOnrampSession({
      customerIpAddress,
      sourceAmountUsd: amountUsd.toFixed(2),
      clientNetwork: network,
      clientWallet: wallet,
      clientAsset: net.asset,
      customer: email ? { email } : undefined,
      finishUrl: `${origin}/checkout?onramp=1`,
    });

    if (!session.client_secret) {
      return NextResponse.json(
        { error: "Onramp session missing client_secret" },
        { status: 500 },
      );
    }

    if (!session.redirect_url) {
      return NextResponse.json(
        { error: "Onramp session missing hosted Link Pay URL" },
        { status: 500 },
      );
    }

    await upsertAwaitingCryptoOrder({
      onrampSessionId: session.id,
      amountCents: Math.round(amountUsd * 100),
      currency: "usd",
      network,
      asset: net.asset,
      clientWallet: wallet,
    });

    return NextResponse.json({
      clientSecret: session.client_secret,
      redirectUrl: session.redirect_url,
      sessionId: session.id,
      status: session.status,
      livemode: session.livemode ?? isLiveStripeKey(),
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
