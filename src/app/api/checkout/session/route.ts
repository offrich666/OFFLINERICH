import { NextResponse } from "next/server";
import {
  checkoutIntegrationId,
  getAppOrigin,
  getStripe,
} from "@/lib/stripe";
import {
  CLIENT_NETWORKS,
  MAX_AMOUNT_USD,
  MIN_AMOUNT_USD,
  amountUsdToCents,
  getNetwork,
  isValidAmountUsd,
  isValidWalletAddress,
  normalizeWalletAddress,
  parseAmountUsd,
} from "@/lib/networks";

/**
 * Easy card path — regular Stripe Checkout (no Crypto Onramp KYC).
 * Client pays USD → we receive in Stripe → ops delivers crypto to their wallet.
 * Banks that block crypto MCC often work here (business payment, not Onramp).
 */
export async function POST(request: Request) {
  try {
    const stripe = getStripe();
    const origin = getAppOrigin(request);

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
      // empty body
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

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
    }

    const net = getNetwork(network);
    if (!net || !CLIENT_NETWORKS.some((n) => n.id === network)) {
      return NextResponse.json({ error: "Unsupported network" }, { status: 400 });
    }
    if (!isValidWalletAddress(network, wallet)) {
      return NextResponse.json(
        {
          error:
            network === "bitcoin"
              ? "Enter a valid Bitcoin address"
              : "Enter a valid wallet address (0x…)",
        },
        { status: 400 },
      );
    }

    const amountCents = amountUsdToCents(amountUsd);

    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded_page",
      mode: "payment",
      managed_payments: { enabled: false },
      allowed_payment_method_types: ["card"],
      billing_address_collection: "auto",
      phone_number_collection: { enabled: false },
      ...(email ? { customer_email: email } : {}),
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: "OFFLINERICH payment",
              description: `Crypto delivery to ${network} after payment clears`,
              tax_code: "txcd_10000000",
            },
          },
          quantity: 1,
        },
      ],
      return_url: `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
      integration_identifier: checkoutIntegrationId(),
      metadata: {
        project: "offlinerich",
        sku: "offlinerich-easy-card",
        flow: "easy_card_then_crypto",
        amount_usd: String(amountUsd),
        client_network: network,
        client_wallet: wallet,
        client_asset: net.asset,
      },
      payment_intent_data: {
        metadata: {
          amount_usd: String(amountUsd),
          flow: "easy_card_then_crypto",
          client_network: network,
          client_wallet: wallet,
          client_asset: net.asset,
        },
      },
    });

    if (!session.client_secret) {
      return NextResponse.json(
        { error: "Checkout Session missing client_secret" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      clientSecret: session.client_secret,
      sessionId: session.id,
      paymentMethodTypes: session.payment_method_types,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create Checkout Session";
    console.error("[checkout/session]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
