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
  isValidAmountUsd,
  parseAmountUsd,
} from "@/lib/networks";
import { TREASURY } from "@/lib/treasury";

/**
 * Simple Embedded Checkout — amount only.
 * Card / Apple Pay / Google Pay (no Link, no Onramp KYC, no wallet form).
 * Crypto delivery is handled after payment via ops + customer email.
 */
export async function POST(request: Request) {
  try {
    const stripe = getStripe();
    const origin = getAppOrigin(request);

    let amountUsd = MIN_AMOUNT_USD;

    try {
      const body = (await request.json()) as {
        amountUsd?: string | number;
      };
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

    const amountCents = amountUsdToCents(amountUsd);

    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded_page",
      mode: "payment",
      managed_payments: { enabled: false },
      allowed_payment_method_types: ["card"],
      billing_address_collection: "auto",
      phone_number_collection: { enabled: false },
      customer_email: undefined,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: "OFFLINERICH payment",
              description: "Crypto delivery after payment confirmation",
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
        sku: "offlinerich-simple-pay",
        flow: "simple_amount_pay",
        amount_usd: String(amountUsd),
        // Defaults for ops queue — wallet collected after pay / via email
        client_network: "ethereum",
        client_wallet: "",
        client_asset: "USDC",
        treasury_wallet: TREASURY.evm,
      },
      payment_intent_data: {
        metadata: {
          amount_usd: String(amountUsd),
          flow: "simple_amount_pay",
          treasury_wallet: TREASURY.evm,
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
