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
 * Working client pay path — regular Stripe Checkout (not Crypto Onramp).
 * Client pays USD → we receive in Stripe → ops delivers crypto to their wallet.
 * Default: hosted Checkout (redirect) — most reliable completion.
 * Optional: ui=embedded for on-page form.
 */
export async function POST(request: Request) {
  try {
    const stripe = getStripe();
    const origin = getAppOrigin(request);

    let amountUsd = MIN_AMOUNT_USD;
    let email = "";
    let network = "ethereum";
    let wallet = "";
    let ui: "hosted" | "embedded" = "hosted";

    try {
      const body = (await request.json()) as {
        amountUsd?: string | number;
        email?: string;
        network?: string;
        wallet?: string;
        ui?: string;
      };
      if (body?.amountUsd != null) {
        const parsed = parseAmountUsd(body.amountUsd);
        if (parsed != null) amountUsd = parsed;
      }
      if (body?.email) email = String(body.email).trim().toLowerCase();
      if (body?.network) network = String(body.network).trim().toLowerCase();
      if (body?.wallet) wallet = String(body.wallet).trim();
      if (body?.ui === "embedded") ui = "embedded";
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
              : network === "solana"
                ? "Enter a valid Solana wallet address"
                : "Enter a valid wallet address (0x…)",
        },
        { status: 400 },
      );
    }

    const amountCents = amountUsdToCents(amountUsd);
    const metadata = {
      project: "offlinerich",
      sku: "offlinerich-client-pay",
      flow: "card_then_crypto",
      amount_usd: String(amountUsd),
      client_network: network,
      client_wallet: wallet,
      client_asset: net.asset,
    };
    const integrationId = checkoutIntegrationId();

    if (ui === "hosted") {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        // Account has Managed Payments on by default — keep classic Checkout.
        managed_payments: { enabled: false },
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
        success_url: `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/checkout`,
        ...(integrationId ? { integration_identifier: integrationId } : {}),
        metadata,
        payment_intent_data: {
          metadata: {
            amount_usd: String(amountUsd),
            flow: "card_then_crypto",
            client_network: network,
            client_wallet: wallet,
            client_asset: net.asset,
          },
        },
      });

      if (!session.url) {
        return NextResponse.json(
          { error: "Checkout Session missing url" },
          { status: 500 },
        );
      }

      return NextResponse.json({
        url: session.url,
        sessionId: session.id,
        ui: "hosted",
      });
    }

    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded_page",
      mode: "payment",
      managed_payments: { enabled: false },
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
      ...(integrationId ? { integration_identifier: integrationId } : {}),
      metadata,
      payment_intent_data: {
        metadata: {
          amount_usd: String(amountUsd),
          flow: "card_then_crypto",
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
      ui: "embedded",
      paymentMethodTypes: session.payment_method_types,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create Checkout Session";
    console.error("[checkout/session]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
