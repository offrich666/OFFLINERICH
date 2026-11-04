import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

/**
 * Poll a Crypto Onramp session after hosted Link checkout.
 * Used when the buyer returns to /checkout so we can show done without remounting an embed.
 */
export async function GET(request: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Not configured" }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = (searchParams.get("sessionId") || "").trim();
    if (!sessionId || !/^cos_/.test(sessionId)) {
      return NextResponse.json({ error: "Invalid session" }, { status: 400 });
    }

    const stripe = getStripe();
    const session = (await stripe.rawRequest(
      "GET",
      `/v1/crypto/onramp_sessions/${encodeURIComponent(sessionId)}`,
    )) as {
      id?: string;
      status?: string;
      transaction_details?: { destination_amount?: string; destination_currency?: string };
    };

    return NextResponse.json({
      sessionId: session.id ?? sessionId,
      status: session.status ?? "unknown",
      complete:
        session.status === "fulfillment_complete" ||
        session.status === "fulfillment_processing",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not load session status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
