import { NextResponse } from "next/server";
import { verifyMoonPayWebhook } from "@/lib/moonpay";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature =
    request.headers.get("moonpay-signature-v2") ||
    request.headers.get("Moonpay-Signature-V2");

  if (!verifyMoonPayWebhook(rawBody, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: { type?: string; data?: { id?: string; status?: string } };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  console.info("[moonpay webhook]", event.type, event.data?.id, event.data?.status);
  return NextResponse.json({ received: true });
}
