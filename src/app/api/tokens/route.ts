import { NextRequest, NextResponse } from "next/server";
import {
  loadBoostedScreenerTokens,
  loadSearchScreenerTokens,
} from "@/lib/dexscreener";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  try {
    const tokens = query
      ? await loadSearchScreenerTokens(query)
      : await loadBoostedScreenerTokens();

    return NextResponse.json(
      {
        source: query ? "search" : "boosts",
        query,
        updatedAt: new Date().toISOString(),
        tokens,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load tokens";
    return NextResponse.json({ error: message, tokens: [] }, { status: 502 });
  }
}
