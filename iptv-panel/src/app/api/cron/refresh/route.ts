import { NextRequest, NextResponse } from "next/server";
import { refreshAllSources } from "@/lib/refresh";

export const runtime = "nodejs";

/**
 * External cron hook. Protect with CRON_SECRET header when set:
 *   Authorization: Bearer <CRON_SECRET>
 *   or ?secret=<CRON_SECRET>
 */
export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get("authorization");
    const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    const querySecret = new URL(req.url).searchParams.get("secret");
    if (bearer !== expected && querySecret !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await refreshAllSources();
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  return POST(req);
}
