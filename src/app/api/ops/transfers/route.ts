import { NextResponse } from "next/server";
import { listTransferOrders, markOrderSent } from "@/lib/orders";

function authorized(request: Request): boolean {
  const expected = process.env.OPS_SECRET || "";
  if (!expected) return false;
  const header = request.headers.get("x-ops-key") || "";
  const url = new URL(request.url);
  const query = url.searchParams.get("key") || "";
  return header === expected || query === expected;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orders = await listTransferOrders();
  return NextResponse.json({ orders });
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json()) as {
    orderId?: string;
    outboundTxHash?: string;
  };
  if (!body.orderId || !body.outboundTxHash?.trim()) {
    return NextResponse.json(
      { error: "orderId and outboundTxHash required" },
      { status: 400 },
    );
  }
  const order = await markOrderSent(body.orderId, body.outboundTxHash.trim());
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, order });
}
