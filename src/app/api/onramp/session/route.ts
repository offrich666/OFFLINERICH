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
 * Stripe Crypto Onramp session for ON-PAGE embed only.
 * Returns clientSecret — never send buyers to crypto.link.com.
 */
export async function POST(request: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error("[onramp/session] STRIPE_SECRET_KEY is not set");
      return NextResponse.json(
        {
          error: "Checkout is temporarily unavailable. Please try again soon.",
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

    const session = await createClientOnrampSession({
      customerIpAddress,
      sourceAmountUsd: amountUsd.toFixed(2),
      clientNetwork: network,
      clientWallet: wallet,
      clientAsset: net.asset,
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
      network,
      asset: net.asset,
      clientWallet: wallet,
    });

    // Intentionally omit redirectUrl — checkout mounts embed on this site only.
    return NextResponse.json({
      clientSecret: session.client_secret,
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
