import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";

/**
 * Fulfillment for Checkout. Webhooks are required for reliable payment
 * confirmation (esp. async methods). Gate on payment_status.
 */
async function fulfillCheckoutSession(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
    console.info("[stripe webhook] skip fulfill — payment_status=", session.payment_status);
    return;
  }

  console.info("[stripe webhook] fulfill", {
    sessionId: session.id,
    paymentStatus: session.payment_status,
    customerEmail: session.customer_details?.email ?? session.customer_email,
    amountTotal: session.amount_total,
    currency: session.currency,
    metadata: session.metadata,
  });

  // Extend here: mint drop access, email receipt, write to DB, etc.
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const payload = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid signature";
    console.error("[stripe webhook] signature verify failed:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed" ||
        event.type === "checkout.session.async_payment_succeeded") {
      await fulfillCheckoutSession(event.data.object as Stripe.Checkout.Session);
    } else if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      console.warn("[stripe webhook] async payment failed", session.id);
    } else if ((event.type as string) === "crypto.onramp_session.updated") {
      const onramp = event.data.object as {
        id?: string;
        status?: string;
        transaction_details?: Record<string, unknown>;
        metadata?: Record<string, string>;
      };
      console.info("[stripe webhook] onramp updated", {
        id: onramp.id,
        status: onramp.status,
        details: onramp.transaction_details,
        metadata: onramp.metadata,
      });
      if (onramp.status === "fulfillment_complete") {
        console.info("[stripe webhook] treasury crypto delivered", onramp.id);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Handler error";
    console.error("[stripe webhook] handler error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
