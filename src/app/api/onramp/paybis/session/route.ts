import { NextResponse } from "next/server";
import {
  MAX_AMOUNT_USD,
  MIN_AMOUNT_USD,
  isValidAmountUsd,
  isValidWalletAddress,
  normalizeWalletAddress,
  parseAmountUsd,
} from "@/lib/networks";
import {
  PAYBIS_CRYPTO_BY_NETWORK,
  PAYBIS_MERCHANT_EMAIL,
  buildPaybisEmbedUrl,
  isPaybisConfigured,
} from "@/lib/paybis";

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
 * Instant via Paybis embed — card → USDC to buyer wallet, stays on checkout.
 * Merchant product: PAYBIS_PARTNER_ID (dashboard: richoffline666@gmail.com).
 */
export async function POST(request: Request) {
  try {
    if (!isPaybisConfigured()) {
      return NextResponse.json(
        {
          error:
            "Paybis Instant is not configured yet. Add PAYBIS_PARTNER_ID + PAYBIS_HMAC_KEY (from Paybis dashboard) and whitelist www.walletchainsign.com.",
          code: "paybis_not_configured",
          merchantEmail: PAYBIS_MERCHANT_EMAIL,
        },
        { status: 503 },
      );
    }

    let amountUsd = MIN_AMOUNT_USD;
    let network = "ethereum";
    let wallet = "";
    let email = "";

    try {
      const body = (await request.json()) as {
        amountUsd?: string | number;
        network?: string;
        wallet?: string;
        email?: string;
      };
      if (body?.amountUsd != null) {
        const parsed = parseAmountUsd(body.amountUsd);
        if (parsed != null) amountUsd = parsed;
      }
      if (body?.network) network = String(body.network).trim().toLowerCase();
      if (body?.wallet) wallet = String(body.wallet).trim();
      if (body?.email) email = String(body.email).trim().toLowerCase();
    } catch {
      /* empty */
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
    if (!PAYBIS_CRYPTO_BY_NETWORK[network]) {
      return NextResponse.json(
        { error: "Choose Ethereum, Polygon, Base, or BNB Chain." },
        { status: 400 },
      );
    }
    if (!isValidWalletAddress(network, wallet)) {
      return NextResponse.json(
        { error: "Enter a valid wallet address (0x + 40 hex)." },
        { status: 400 },
      );
    }

    const origin = getAppOrigin(request);
    const { widgetUrl, environment } = buildPaybisEmbedUrl({
      amountUsd,
      network,
      walletAddress: wallet,
      partnerUserId: email || wallet.toLowerCase(),
      successReturnURL: `${origin}/checkout?paid=1`,
      failureReturnURL: `${origin}/checkout?paid=0`,
    });

    return NextResponse.json({
      url: widgetUrl,
      environment,
      provider: "paybis",
      mode: "embed",
      merchantEmail: PAYBIS_MERCHANT_EMAIL,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start Paybis Instant";
    console.error("[onramp/paybis/session]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ready: isPaybisConfigured(),
    provider: "paybis",
    merchantEmail: PAYBIS_MERCHANT_EMAIL,
    note: "On-page Paybis embed — card → crypto to buyer wallet. Whitelist www.walletchainsign.com in Paybis.",
  });
}
