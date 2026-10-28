import { NextRequest, NextResponse } from "next/server";
import {
  crossmintFetch,
  getCheckoutPrice,
  getCollectionId,
} from "@/lib/crossmint";

type OrderBody = {
  email?: string;
  quantity?: number;
};

export async function POST(req: NextRequest) {
  try {
    const collectionId = getCollectionId();
    if (!collectionId) {
      return NextResponse.json(
        {
          error:
            "Set NEXT_PUBLIC_CROSSMINT_COLLECTION_ID to a sellable Crossmint collection.",
        },
        { status: 400 },
      );
    }

    const body = (await req.json()) as OrderBody;
    const email = body.email?.trim();
    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    const quantity = Math.max(1, Math.min(10, Number(body.quantity) || 1));
    const unitPrice = getCheckoutPrice();

    const { ok, status, data } = await crossmintFetch("/orders", {
      method: "POST",
      body: JSON.stringify({
        recipient: { email },
        locale: "en-US",
        payment: {
          receiptEmail: email,
          method: "fiat",
          currency: "usd",
        },
        lineItems: [
          {
            collectionLocator: `crossmint:${collectionId}`,
            callData: {
              totalPrice: String(Number(unitPrice) * quantity),
              quantity,
            },
          },
        ],
      }),
    });

    return NextResponse.json(data, { status: ok ? 200 : status });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create order";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
