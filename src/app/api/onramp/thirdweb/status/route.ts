import { NextResponse } from "next/server";
import {
  getInstantOnrampStatus,
  isThirdwebOnrampConfigured,
} from "@/lib/thirdwebOnramp";

export async function GET(request: Request) {
  try {
    if (!isThirdwebOnrampConfigured()) {
      return NextResponse.json(
        { error: "Instant is not configured" },
        { status: 503 },
      );
    }
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }
    const status = await getInstantOnrampStatus(id);
    return NextResponse.json(status);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
