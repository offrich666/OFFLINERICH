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
  buildMoonPayWidgetUrl,
  buildOnramperWidgetUrl,
} from "@/lib/instantOnramp";

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
 * Instant crypto that completes without Transak/Ramp partner keys:
 * MoonPay (primary) → Onramper (fallback).
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
    const redirectURL = `${origin}/checkout/return`;
    const input = {
      amountUsd,
      network,
      walletAddress: wallet,
      email: email || undefined,
      redirectURL,
    };

    try {
      const url = buildMoonPayWidgetUrl(input);
      return NextResponse.json({
        url,
        provider: "moonpay",
        mode: "hosted",
      });
    } catch (moonErr) {
      console.warn(
        "[onramp/instant] MoonPay URL failed; Onramper fallback",
        moonErr instanceof Error ? moonErr.message : moonErr,
      );
      const url = buildOnramperWidgetUrl(input);
      return NextResponse.json({
        url,
        provider: "onramper",
        mode: "hosted",
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
    providers: ["moonpay", "onramper"],
    defaultProvider: "moonpay",
    note: "Instant opens MoonPay buy (card → crypto to your wallet). No Transak keys required.",
  });
}
