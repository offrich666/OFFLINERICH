import { NextResponse } from "next/server";
import {
  CLIENT_NETWORKS,
  getNetwork,
  isValidWalletAddress,
} from "@/lib/networks";
import { attachDeliveryWallet } from "@/lib/orders";

/**
 * After Onramp pay, client gives the wallet where THEY want crypto delivered.
 * Treasury address stays server-side only.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      sessionId?: string;
      network?: string;
      wallet?: string;
      email?: string;
    };

    const sessionId = String(body.sessionId || "").trim();
    const network = String(body.network || "ethereum").trim().toLowerCase();
    const wallet = String(body.wallet || "").trim();
    const email = body.email ? String(body.email).trim().toLowerCase() : null;

    if (!sessionId) {
      return NextResponse.json({ error: "Missing session" }, { status: 400 });
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

    const order = await attachDeliveryWallet({
      onrampSessionId: sessionId,
      network,
      asset: net.asset,
      clientWallet: wallet,
      customerEmail: email,
    });

    if (!order) {
      return NextResponse.json(
        { error: "Order not found — payment may still be processing" },
        { status: 404 },
      );
    }

    // Never return treasuryWallet to the client.
    return NextResponse.json({
      ok: true,
      orderId: order.id,
      network: order.network,
      asset: order.asset,
      clientWallet: order.clientWallet,
      status: order.status,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save delivery wallet";
    console.error("[onramp/delivery]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
