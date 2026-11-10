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
  buildPaybisRedirectUrl,
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
 * Paybis redirect — opens Paybis so the buyer pays there (card → crypto).
 * Uses signed partner widget when keys exist; otherwise paybis.com.
 */
export async function POST(request: Request) {
  try {
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
    const built = buildPaybisRedirectUrl({
      amountUsd,
      network,
      walletAddress: wallet,
      partnerUserId: email || wallet.toLowerCase(),
      successReturnURL: `${origin}/checkout?paid=1`,
      failureReturnURL: `${origin}/checkout?paid=0`,
    });

    return NextResponse.json({
      url: built.url,
      environment: built.environment,
      provider: "paybis",
      mode: built.mode,
      merchantEmail: PAYBIS_MERCHANT_EMAIL,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start Paybis";
    console.error("[onramp/paybis/session]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ready: true,
    partnerConfigured: isPaybisConfigured(),
    provider: "paybis",
    merchantEmail: PAYBIS_MERCHANT_EMAIL,
    note: "Paybis opens paybis.com (or signed partner widget) in a redirect so buyers pay there.",
  });
}
