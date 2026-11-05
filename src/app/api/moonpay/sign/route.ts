import { NextResponse } from "next/server";
import { signMoonPayUrl } from "@/lib/moonpay";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string };
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url) {
      return NextResponse.json({ error: "url required" }, { status: 400 });
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ error: "invalid url" }, { status: 400 });
    }
    if (!parsed.hostname.endsWith("moonpay.com")) {
      return NextResponse.json({ error: "url must be moonpay.com" }, { status: 400 });
    }
    const signature = signMoonPayUrl(url);
    return NextResponse.json({ signature });
  } catch (error) {
    const message = error instanceof Error ? error.message : "sign failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
