import { NextRequest, NextResponse } from "next/server";
import { listLanUrls } from "@/lib/babyphone/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const host = request.headers.get("host") || "localhost:3000";
  const portMatch = host.match(/:(\d+)$/);
  const port = portMatch ? Number(portMatch[1]) : 3000;
  const urls = listLanUrls(port, "/babyphone");
  return NextResponse.json({
    host,
    urls,
    tip: "Phones need the same Wi‑Fi. Prefer HTTPS so the camera permission works.",
  });
}
