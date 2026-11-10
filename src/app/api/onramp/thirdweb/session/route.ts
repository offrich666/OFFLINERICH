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
  isThirdwebInstantNetwork,
  type ThirdwebInstantNetworkId,
} from "@/lib/thirdwebPublic";
import {
  isThirdwebOnrampConfigured,
  prepareInstantOnramp,
  withCheckoutReturnUrl,
} from "@/lib/thirdwebOnramp";

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
 * Instant that completes: thirdweb prepares a live Transak/Coinbase session
 * that settles USDC to the buyer wallet. No Stripe Onramp.
 */
export async function POST(request: Request) {
  try {
    if (!isThirdwebOnrampConfigured()) {
      return NextResponse.json(
        {
          error: "Instant is not configured (thirdweb secret missing).",
          code: "thirdweb_not_configured",
        },
        { status: 503 },
      );
    }

    let amountUsd = MIN_AMOUNT_USD;
    let network: ThirdwebInstantNetworkId = "ethereum";
    let wallet = "";
    let country = "";

    try {
      const body = (await request.json()) as {
        amountUsd?: string | number;
        network?: string;
        wallet?: string;
        country?: string;
      };
      if (body?.amountUsd != null) {
        const parsed = parseAmountUsd(body.amountUsd);
        if (parsed != null) amountUsd = parsed;
      }
      if (body?.network) {
        const n = String(body.network).trim().toLowerCase();
        if (isThirdwebInstantNetwork(n)) network = n;
      }
      if (body?.wallet) wallet = String(body.wallet).trim();
      if (body?.country) country = String(body.country).trim().toUpperCase();
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
    if (!isThirdwebInstantNetwork(network)) {
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

    const prepared = await prepareInstantOnramp({
      amountUsd,
      network,
      walletAddress: wallet,
      country: country || undefined,
    });

    const origin = getAppOrigin(request);
    const payUrl = withCheckoutReturnUrl(
      prepared.link,
      `${origin}/checkout`,
      prepared.id,
    );

    return NextResponse.json({
      id: prepared.id,
      url: payUrl,
      provider: prepared.provider,
      currencyAmount: prepared.currencyAmount,
      currency: prepared.currency,
      mode: "complete",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start Instant";
    console.error("[onramp/thirdweb/session]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ready: isThirdwebOnrampConfigured(),
    providers: ["coinbase", "transak"],
    note: "Instant prepares a live card session that settles crypto to the buyer wallet.",
  });
}
