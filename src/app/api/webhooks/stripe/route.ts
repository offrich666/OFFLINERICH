import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import {
  markOnrampDeliveredToClient,
  upsertAwaitingCryptoOrder,
  upsertPaidTransferOrder,
} from "@/lib/orders";

type OnrampSessionObject = {
  id: string;
  status?: string | null;
  metadata?: Record<string, string> | null;
  source_amount?: string | null;
  source_currency?: string | null;
};

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
    "ethereum";
  const clientWallet =
    meta.client_wallet ||
    customFieldValue(session.custom_fields, "wallet") ||
    "";
  const asset = meta.client_asset || (network === "bitcoin" ? "BTC" : "USDC");
  const customerEmail =
    session.customer_details?.email ?? session.customer_email ?? null;

  // Simple amount-pay flow has no wallet up front — still queue the paid order
  // so ops can collect a delivery wallet from the customer email.
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
    clientWallet: clientWallet || "(awaiting wallet — contact customer)",
    customerEmail,
  });

  console.info("[stripe webhook] transfer order queued", {
    orderId: order.id,
    network: order.network,
    clientWallet: order.clientWallet,
    customerEmail: order.customerEmail,
    treasuryWallet: order.treasuryWallet,
    amountCents: order.amountCents,
  });
}

/**
 * Onramp: client paid fiat → crypto locked to THEIR wallet.
 * fulfillment_complete ⇒ already delivered; mark sent_to_client.
 */
async function fulfillOnrampSession(session: OnrampSessionObject) {
  const status = session.status || "";
  console.info("[stripe webhook] onramp_session", {
    id: session.id,
    status,
  });

  if (status !== "fulfillment_complete") {
    return;
  }

  const meta = session.metadata || {};
  const network = meta.client_network || "ethereum";
  const clientWallet = meta.client_wallet || "";
  const asset =
    meta.client_asset || (network === "bitcoin" ? "BTC" : "USDC");
  const sourceAmount = Number(session.source_amount || 0);
  const amountCents = Number.isFinite(sourceAmount)
    ? Math.round(sourceAmount * 100)
    : 0;

  if (clientWallet) {
    await upsertAwaitingCryptoOrder({
      onrampSessionId: session.id,
      amountCents: amountCents || 1000,
      currency: session.source_currency || "usd",
      network,
      asset,
      clientWallet,
    });
  }

  const order = await markOnrampDeliveredToClient(session.id);
  if (!order) {
    console.error(
      "[stripe webhook] onramp fulfillment_complete but no order",
      session.id,
    );
    return;
  }

  console.info("[stripe webhook] onramp delivered to client wallet", {
    orderId: order.id,
    network: order.network,
    clientWallet: order.clientWallet,
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
    const type = event.type as string;
    if (
      type === "checkout.session.completed" ||
      type === "checkout.session.async_payment_succeeded"
    ) {
      await fulfillCheckoutSession(event.data.object as Stripe.Checkout.Session);
    } else if (type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      console.warn("[stripe webhook] async payment failed", session.id);
    } else if (type === "crypto.onramp_session.updated") {
      // Not yet in Stripe Node types — Crypto Onramp webhook
      await fulfillOnrampSession(
        event.data.object as unknown as OnrampSessionObject,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Handler error";
    console.error("[stripe webhook] handler error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
