import { NextResponse } from "next/server";
import {
  createTreasuryOnrampSession,
  isLiveStripeKey,
} from "@/lib/stripe";
import {
  MAX_AMOUNT_USD,
  MIN_AMOUNT_USD,
  getNetwork,
  isValidAmountUsd,
  isValidWalletAddress,
  parseAmountUsd,
} from "@/lib/networks";
import { upsertAwaitingCryptoOrder } from "@/lib/orders";

export async function POST(request: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        {
          error: "STRIPE_SECRET_KEY missing",
          code: "missing_keys",
          hint: "Onramp is approved — paste pk_live_/sk_live_ into env. See docs/CRYPTO_RECEIVE_ROADMAP.md",
        },
        { status: 503 },
      );
    }

    let amountUsd = MIN_AMOUNT_USD;
    let network = "ethereum";
    let wallet = "";
    let asset = "USDC";

    try {
      const body = (await request.json()) as {
        amountUsd?: string | number;
        network?: string;
        wallet?: string;
        asset?: string;
      };
      if (body?.amountUsd != null) {
        const parsed = parseAmountUsd(body.amountUsd);
        if (parsed != null) amountUsd = parsed;
      }
      if (body?.network) network = String(body.network).trim().toLowerCase();
      if (body?.wallet) wallet = String(body.wallet).trim();
      if (body?.asset) asset = String(body.asset).trim().toUpperCase();
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

    const net = getNetwork(network);
    if (!net) {
      return NextResponse.json({ error: "Unsupported network" }, { status: 400 });
    }
    if (!isValidWalletAddress(network, wallet)) {
      return NextResponse.json(
        { error: "Valid client wallet address is required" },
        { status: 400 },
      );
    }
    asset = net.asset;

    const forwarded = request.headers.get("x-forwarded-for");
    const customerIpAddress =
      forwarded?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      undefined;

    const session = await createTreasuryOnrampSession({
      customerIpAddress,
      sourceAmountUsd: amountUsd.toFixed(2),
      clientNetwork: network,
      clientWallet: wallet,
      clientAsset: asset,
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
      asset,
      clientWallet: wallet,
    });

    return NextResponse.json({
      clientSecret: session.client_secret,
      sessionId: session.id,
      status: session.status,
      redirectUrl: session.redirect_url ?? null,
      livemode: session.livemode ?? isLiveStripeKey(),
      mode: "onramp_to_treasury",
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
        roadmap: "/docs/CRYPTO_RECEIVE_ROADMAP.md",
        applyUrl: "https://dashboard.stripe.com/crypto-onramp/get-started",
      },
      { status: needsOnramp ? 503 : 500 },
    );
  }
}
