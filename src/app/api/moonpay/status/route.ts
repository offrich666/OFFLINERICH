import { NextResponse } from "next/server";
import { isMoonPayTestMode } from "@/lib/moonpay";

export async function GET() {
  const pk = process.env.NEXT_PUBLIC_MOONPAY_API_KEY || "";
  const sk = process.env.MOONPAY_SECRET_KEY || "";
  const wk = process.env.MOONPAY_WEBHOOK_KEY || "";

  return NextResponse.json({
    product: "GN Labs Crypto",
    provider: "moonpay",
    publishableKeyPresent: Boolean(pk),
    secretKeyPresent: Boolean(sk),
    webhookKeyPresent: Boolean(wk),
    testMode: isMoonPayTestMode(pk),
    publishableKeyPrefix: pk.slice(0, 10) || null,
  });
}
