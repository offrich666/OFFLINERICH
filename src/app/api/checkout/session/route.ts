import { NextResponse } from "next/server";
import {
  checkoutIntegrationId,
  getAppOrigin,
  getStripe,
} from "@/lib/stripe";
import {
  MAX_AMOUNT_USD,
  MIN_AMOUNT_USD,
  amountUsdToCents,
  getNetwork,
  isValidAmountUsd,
  isValidWalletAddress,
  parseAmountUsd,
} from "@/lib/networks";
import { TREASURY } from "@/lib/treasury";

/**
 * Direct Checkout — card / Apple Pay / Google Pay only (no Link, no Onramp KYC).
 * Fiat settles to Stripe; webhook queues treasury → client crypto delivery.
 */
export async function POST(request: Request) {
  try {
    const stripe = getStripe();
    const origin = getAppOrigin(request);

    let network = "ethereum";
    let wallet = "";
    let asset = "USDC";
    let amountUsd = MIN_AMOUNT_USD;

    try {
      const body = (await request.json()) as {
        network?: string;
        wallet?: string;
        asset?: string;
        amountUsd?: string | number;
      };
      if (body?.network) network = String(body.network).trim().toLowerCase();
      if (body?.wallet) wallet = String(body.wallet).trim();
      if (body?.asset) asset = String(body.asset).trim().toUpperCase();
      if (body?.amountUsd != null) {
        const parsed = parseAmountUsd(body.amountUsd);
        if (parsed != null) amountUsd = parsed;
      }
    } catch {
      // empty body
    }

    if (!isValidAmountUsd(amountUsd)) {
      return NextResponse.json(
        {
          error: `Amount must be between $${MIN_AMOUNT_USD} and $${MAX_AMOUNT_USD}`,
        },
        { status: 400 },
      );
    }

    const net = getNetwork(network);
    if (!net) {
      return NextResponse.json({ error: "Unsupported network" }, { status: 400 });
    }
    if (!isValidWalletAddress(network, wallet)) {
      return NextResponse.json(
        { error: "Valid client wallet address is required" },
        { status: 400 },
      );
    }
    asset = net.asset;

    const amountCents = amountUsdToCents(amountUsd);
    const treasuryWallet =
      network === "bitcoin" ? TREASURY.bitcoin : TREASURY.evm;

    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded_page",
      mode: "payment",
      // Account defaults to Managed Payments + Link — turn those off for a
      // simple card / Apple Pay / Google Pay form.
      managed_payments: { enabled: false },
      allowed_payment_method_types: ["card"],
      billing_address_collection: "auto",
      phone_number_collection: { enabled: false },
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: "Crypto delivery",
              description: `${asset} on ${network} after payment`,
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
        sku: "offlinerich-drop-flex",
        flow: "direct_pay_then_treasury_send",
        amount_usd: String(amountUsd),
        client_network: network,
        client_wallet: wallet,
        client_asset: asset,
        treasury_wallet: treasuryWallet,
      },
      payment_intent_data: {
        metadata: {
          amount_usd: String(amountUsd),
          client_network: network,
          client_wallet: wallet,
          client_asset: asset,
          treasury_wallet: treasuryWallet,
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
      paymentMethodTypes: session.payment_method_types,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create Checkout Session";
    console.error("[checkout/session]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
