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
import { buildMoonPayFallbackUrl, buildRampWidgetUrl } from "@/lib/ramp";

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
 * Instant crypto that completes: Ramp Network (locked wallet) → MoonPay fallback.
 * Replaces broken Transak/Stripe Instant Pay paths.
 */
export async function POST(request: Request) {
  try {
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
    const finalUrl = `${origin}/checkout/return`;
    const logoUrl = `${origin}/favicon.ico`;

    try {
      const url = buildRampWidgetUrl({
        amountUsd,
        network,
        walletAddress: wallet,
        email: email || undefined,
        finalUrl,
        logoUrl,
      });
      return NextResponse.json({
        url,
        provider: "ramp",
        mode: "hosted",
      });
    } catch (rampErr) {
      console.warn(
        "[onramp/instant] Ramp URL failed; MoonPay fallback",
        rampErr instanceof Error ? rampErr.message : rampErr,
      );
      const url = buildMoonPayFallbackUrl({
        amountUsd,
        redirectURL: finalUrl,
      });
      return NextResponse.json({
        url,
        provider: "moonpay",
        mode: "hosted",
        note: "Paste your wallet in the buy form if asked.",
      });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start Instant crypto";
    console.error("[onramp/instant/session]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ready: true,
    providers: ["ramp", "moonpay"],
    defaultProvider: "ramp",
    note: "Instant opens Ramp Network (crypto to your wallet). Optional RAMP_HOST_API_KEY on Vercel for partner tracking.",
  });
}
