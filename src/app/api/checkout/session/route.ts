import { NextResponse } from "next/server";
import {
  checkoutIntegrationId,
  getAppOrigin,
  getStripe,
  getStripePriceId,
} from "@/lib/stripe";

export async function POST(request: Request) {
  try {
    const stripe = getStripe();
    const priceId = getStripePriceId();
    const origin = getAppOrigin(request);

    let customerEmail: string | undefined;
    try {
      const body = (await request.json()) as { email?: string };
      if (body?.email && typeof body.email === "string") {
        customerEmail = body.email.trim() || undefined;
      }
    } catch {
      // no body is fine
    }

    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded_page",
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      return_url: `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
      integration_identifier: checkoutIntegrationId(),
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      metadata: {
        project: "offlinerich",
        sku: "offlinerich-drop",
      },
    });

    if (!session.client_secret) {
      return NextResponse.json(
        { error: "Checkout Session missing client_secret" },
        { status: 500 },
      );
    }

    return NextResponse.json({ clientSecret: session.client_secret });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create Checkout Session";
    console.error("[checkout/session]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
