import { NextResponse } from "next/server";
import {
  checkoutIntegrationId,
  getAppOrigin,
  getStripe,
  getStripePriceId,
} from "@/lib/stripe";
import { getNetwork, isValidWalletAddress } from "@/lib/networks";
import { TREASURY } from "@/lib/treasury";

export async function POST(request: Request) {
  try {
    const stripe = getStripe();
    const priceId = getStripePriceId();
    const origin = getAppOrigin(request);

    let customerEmail: string | undefined;
    let network = "polygon";
    let wallet = "";
    let asset = "USDC";

    try {
      const body = (await request.json()) as {
        email?: string;
        network?: string;
        wallet?: string;
        asset?: string;
      };
      if (body?.email && typeof body.email === "string") {
        customerEmail = body.email.trim() || undefined;
      }
      if (body?.network) network = String(body.network).trim().toLowerCase();
      if (body?.wallet) wallet = String(body.wallet).trim();
      if (body?.asset) asset = String(body.asset).trim().toUpperCase();
    } catch {
      // empty body
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

    const treasuryWallet =
      network === "bitcoin" ? TREASURY.bitcoin : TREASURY.evm;

    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded_page",
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      return_url: `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
      integration_identifier: checkoutIntegrationId(),
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      // Omit payment_method_types → dynamic methods (card, Apple Pay, Google Pay)
      metadata: {
        project: "offlinerich",
        sku: "offlinerich-drop-9000",
        flow: "client_wallet_via_treasury",
        client_network: network,
        client_wallet: wallet,
        client_asset: asset,
        // Internal routing hint for ops / webhooks — never shown in client UI
        treasury_wallet: treasuryWallet,
      },
      payment_intent_data: {
        metadata: {
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

    return NextResponse.json({ clientSecret: session.client_secret });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create Checkout Session";
    console.error("[checkout/session]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
