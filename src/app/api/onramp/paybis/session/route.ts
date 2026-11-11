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
 * Paybis session:
 * - mode=embed → on-page Buy Instant iframe (signed widget, partner keys required)
 * - mode=redirect (default) → open paybis.com / signed widget in full page
 */
export async function POST(request: Request) {
  try {
    let amountUsd = MIN_AMOUNT_USD;
    let network = "ethereum";
    let wallet = "";
    let email = "";
    let mode: "embed" | "redirect" = "redirect";

    try {
      const body = (await request.json()) as {
        amountUsd?: string | number;
        network?: string;
        wallet?: string;
        email?: string;
        mode?: string;
      };
      if (body?.amountUsd != null) {
        const parsed = parseAmountUsd(body.amountUsd);
        if (parsed != null) amountUsd = parsed;
      }
      if (body?.network) network = String(body.network).trim().toLowerCase();
      if (body?.wallet) wallet = String(body.wallet).trim();
      if (body?.email) email = String(body.email).trim().toLowerCase();
      if (String(body?.mode || "").toLowerCase() === "embed") mode = "embed";
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
    const input = {
      amountUsd,
      network,
      walletAddress: wallet,
      partnerUserId: email || wallet.toLowerCase(),
      successReturnURL: `${origin}/checkout?paid=1`,
      failureReturnURL: `${origin}/checkout?paid=0`,
    };

    if (mode === "embed") {
      if (!isPaybisConfigured()) {
        return NextResponse.json(
          {
            error:
              "Buy Instant needs Paybis Partner ID + HMAC (dashboard: richoffline666@gmail.com) and whitelist www.walletchainsign.com. Use Paybis redirect until then.",
            code: "paybis_embed_not_configured",
            merchantEmail: PAYBIS_MERCHANT_EMAIL,
          },
          { status: 503 },
        );
      }
      const built = buildPaybisEmbedUrl(input);
      return NextResponse.json({
        url: built.url,
        environment: built.environment,
        provider: "paybis",
        mode: built.mode,
        merchantEmail: PAYBIS_MERCHANT_EMAIL,
      });
    }

    const built = buildPaybisRedirectUrl(input);
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
  const partnerConfigured = isPaybisConfigured();
  return NextResponse.json({
    ready: true,
    partnerConfigured,
    embedReady: partnerConfigured,
    provider: "paybis",
    merchantEmail: PAYBIS_MERCHANT_EMAIL,
    note: partnerConfigured
      ? "Buy Instant embeds Paybis on-page; Paybis chip redirects to paybis.com / signed widget."
      : "Paybis redirect works now. Buy Instant (on-page) unlocks after Partner ID + HMAC are added.",
  });
}
