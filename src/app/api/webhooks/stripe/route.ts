import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { upsertPaidTransferOrder } from "@/lib/orders";

function customFieldValue(
  fields: Stripe.Checkout.Session.CustomField[] | null | undefined,
  key: string,
): string {
  const field = fields?.find((f) => f.key === key);
  if (!field) return "";
  if (field.type === "dropdown") return field.dropdown?.value || "";
  if (field.type === "text") return field.text?.value || "";
  return "";
}

/**
 * Fulfillment: client paid → record treasury→client transfer job.
 * Client UI never sees treasury; ops fulfills from /ops/transfers.
 */
async function fulfillCheckoutSession(session: Stripe.Checkout.Session) {
  if (
    session.payment_status !== "paid" &&
    session.payment_status !== "no_payment_required"
  ) {
    console.info(
      "[stripe webhook] skip fulfill — payment_status=",
      session.payment_status,
    );
    return;
  }

  const meta = session.metadata || {};
  const network =
    meta.client_network ||
    customFieldValue(session.custom_fields, "network") ||
    "polygon";
  const clientWallet =
    meta.client_wallet ||
    customFieldValue(session.custom_fields, "wallet") ||
    "";
  const asset = meta.client_asset || (network === "bitcoin" ? "BTC" : "USDC");

  if (!clientWallet) {
    console.error(
      "[stripe webhook] paid session missing client wallet",
      session.id,
    );
    return;
  }

  const order = await upsertPaidTransferOrder({
    stripeSessionId: session.id,
    stripePaymentIntentId:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id,
    amountCents: session.amount_total ?? 0,
    currency: session.currency || "usd",
    network,
    asset,
    clientWallet,
    customerEmail: session.customer_details?.email ?? session.customer_email,
  });

  console.info("[stripe webhook] transfer order queued", {
    orderId: order.id,
    network: order.network,
    clientWallet: order.clientWallet,
    treasuryWallet: order.treasuryWallet,
    amountCents: order.amountCents,
  });
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 },
    );
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
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      await fulfillCheckoutSession(event.data.object as Stripe.Checkout.Session);
    } else if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      console.warn("[stripe webhook] async payment failed", session.id);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Handler error";
    console.error("[stripe webhook] handler error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
