import { NextResponse } from "next/server";
import {
  CLIENT_NETWORKS,
  MAX_AMOUNT_USD,
  MIN_AMOUNT_USD,
  isValidAmountUsd,
  isValidWalletAddress,
  normalizeWalletAddress,
  parseAmountUsd,
} from "@/lib/networks";
import {
  createTransakWidgetUrl,
  isTransakConfigured,
} from "@/lib/transak";

function getAppOrigin(request: Request): string {
  const origin = request.headers.get("origin");
  if (origin) return origin;
  try {
    return new URL(request.url).origin;
  } catch {
    /* fall through */
  }
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://www.walletchainsign.com"
  );
}

/**
 * Instant crypto (no Stripe): Transak card / Apple Pay / Google Pay → USDC/BTC
 * locked to the client's wallet.
 */
export async function POST(request: Request) {
  try {
    if (!isTransakConfigured()) {
      return NextResponse.json(
        {
          error:
            "Instant crypto is not configured yet. Add TRANSAK_API_KEY + TRANSAK_API_SECRET (staging keys work immediately from dashboard.transak.com).",
          code: "transak_not_configured",
          signupUrl: "https://dashboard.transak.com",
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
    if (!CLIENT_NETWORKS.some((n) => n.id === network)) {
      return NextResponse.json({ error: "Unsupported network" }, { status: 400 });
    }
    if (!isValidWalletAddress(network, wallet)) {
      return NextResponse.json(
        { error: "Enter a valid wallet address for this network" },
        { status: 400 },
      );
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
    }

    const origin = getAppOrigin(request);
    const referrerDomain = (() => {
      try {
        return new URL(origin).host;
      } catch {
        return "www.walletchainsign.com";
      }
    })();

    const forwarded = request.headers.get("x-forwarded-for");
    const userIp =
      forwarded?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      null;

    const { widgetUrl, environment } = await createTransakWidgetUrl({
      amountUsd,
      network,
      walletAddress: wallet,
      email: email || undefined,
      referrerDomain,
      redirectURL: `${origin}/checkout/return`,
      userIp,
    });

    return NextResponse.json({
      url: widgetUrl,
      environment,
      provider: "transak",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start instant crypto";
    console.error("[onramp/transak/session]", message);
    const hint =
      /401|access-token|api key|environment|ip|whitelist/i.test(message)
        ? " Check Transak Dashboard → Staging keys, whitelist www.walletchainsign.com, and partner API IP access."
        : "";
    return NextResponse.json({ error: message + hint }, { status: 500 });
  }
}
