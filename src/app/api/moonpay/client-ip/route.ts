import { NextResponse } from "next/server";
import {
  clientIpFromRequest,
  hashAllowedIpAddress,
  resolvePublicIpFallback,
} from "@/lib/moonpay";

/**
 * Returns MoonPay `allowedIpAddress` hash for the caller.
 * Partner accounts require this on signed widget URLs (IP matching).
 */
export async function GET(request: Request) {
  try {
    let ip = clientIpFromRequest(request);
    let source: "request" | "egress_fallback" = "request";
    if (!ip) {
      ip = await resolvePublicIpFallback();
      source = "egress_fallback";
    }
    if (!ip) {
      return NextResponse.json(
        { error: "Could not determine client IP for MoonPay IP matching" },
        { status: 503 },
      );
    }
    const allowedIpAddress = hashAllowedIpAddress(ip);
    const parts = ip.split(".");
    const hint =
      parts.length === 4
        ? `${parts[0]}.${parts[1]}.*.*`
        : `${ip.slice(0, Math.min(8, ip.length))}…`;
    return NextResponse.json({
      allowedIpAddress,
      ipHint: hint,
      source,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ip hash failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
