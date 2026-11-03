import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  formatAccountSize,
  getChallengePrice,
  parseAccountSize,
  parseProgram,
  programLabel,
} from "@/lib/challenges";
import { getAppOrigin, getStripe } from "@/lib/stripe";
import {
  addPurchase,
  updatePurchaseStripeSession,
  type PurchaseRecord,
} from "@/lib/users";
import { createCryptoInvoice, type CryptoNetwork } from "@/lib/wallets";

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Please log in first" }, { status: 401 });
    }

    const body = (await request.json()) as {
      program?: string;
      size?: number | string;
      method?: "card" | "crypto";
      network?: string;
    };

    const program = parseProgram(String(body.program || ""));
    const size = parseAccountSize(body.size ?? "");
    const method = body.method === "crypto" ? "crypto" : "card";

    if (!program || !size) {
      return NextResponse.json({ error: "Invalid challenge selection" }, { status: 400 });
    }

    const amountUsd = getChallengePrice(program, size);
    const purchaseId = `pur_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
    const purchase: PurchaseRecord = {
      id: purchaseId,
      createdAt: new Date().toISOString(),
      program,
      size,
      amountUsd,
      method,
      status: "pending",
    };

    if (method === "crypto") {
      const network = (body.network || "tron") as CryptoNetwork;
      if (!["solana", "bsc", "tron"].includes(network)) {
        return NextResponse.json({ error: "Unsupported network" }, { status: 400 });
      }
      purchase.network = network;
      const invoice = await createCryptoInvoice({
        userId: user.id,
        email: user.email,
        program,
        size,
        amountUsd,
        network,
        purchaseId,
      });
      purchase.cryptoInvoiceId = invoice.id;
      await addPurchase(user.id, purchase);
      return NextResponse.json({ invoice, purchaseId });
    }

    // Card via Stripe hosted Checkout → G N LABS LLC
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        {
          error:
            "Stripe is not configured (STRIPE_SECRET_KEY). Use crypto checkout or set the GN LABS secret key.",
        },
        { status: 503 },
      );
    }

    await addPurchase(user.id, purchase);
    const stripe = getStripe();
    const origin = getAppOrigin(request);
    const productName = `Funded XL ${programLabel(program)} ${formatAccountSize(size)}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(amountUsd * 100),
            product_data: {
              name: productName,
              description: "Funded XL prop firm challenge fee",
            },
          },
        },
      ],
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/challenges?program=${program}`,
      metadata: {
        project: "fundedxl",
        flow: "challenge_fee",
        user_id: user.id,
        purchase_id: purchaseId,
        program,
        size: String(size),
        amount_usd: String(amountUsd),
      },
      payment_intent_data: {
        metadata: {
          project: "fundedxl",
          user_id: user.id,
          purchase_id: purchaseId,
          program,
          size: String(size),
        },
      },
    });

    await updatePurchaseStripeSession(user.id, purchaseId, session.id);

    if (!session.url) {
      return NextResponse.json(
        { error: "Checkout session missing URL" },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: session.url, sessionId: session.id, purchaseId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Checkout failed";
    console.error("[checkout/challenge]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
