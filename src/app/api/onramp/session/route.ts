import { NextResponse } from "next/server";
import { createTreasuryOnrampSession, isLiveStripeKey } from "@/lib/stripe";
import type { OnrampCurrency, OnrampNetwork } from "@/lib/treasury";

export async function POST(request: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "STRIPE_SECRET_KEY is not configured" },
        { status: 500 },
      );
    }

    let sourceAmountUsd: string | undefined;
    let destinationNetwork: OnrampNetwork | undefined;
    let destinationCurrency: OnrampCurrency | undefined;

    try {
      const body = (await request.json()) as {
        amountUsd?: string | number;
        network?: OnrampNetwork;
        currency?: OnrampCurrency;
      };
      if (body?.amountUsd != null) {
        sourceAmountUsd = String(body.amountUsd);
      }
      if (body?.network) destinationNetwork = body.network;
      if (body?.currency) destinationCurrency = body.currency;
    } catch {
      // empty body ok
    }

    const forwarded = request.headers.get("x-forwarded-for");
    const customerIpAddress =
      forwarded?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      undefined;

    const session = await createTreasuryOnrampSession({
      customerIpAddress,
      sourceAmountUsd,
      destinationNetwork,
      destinationCurrency,
    });

    if (!session.client_secret) {
      return NextResponse.json(
        { error: "Onramp session missing client_secret" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      clientSecret: session.client_secret,
      sessionId: session.id,
      status: session.status,
      redirectUrl: session.redirect_url ?? null,
      livemode: session.livemode ?? isLiveStripeKey(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create onramp session";
    console.error("[onramp/session]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
