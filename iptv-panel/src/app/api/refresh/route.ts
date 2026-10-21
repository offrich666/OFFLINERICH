import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/api";
import { getDb } from "@/lib/db";
import { refreshAllSources } from "@/lib/refresh";

export const runtime = "nodejs";

export async function GET() {
  const denied = await assertAdmin();
  if (denied) return denied;

  const database = getDb();
  const logs = database
    .prepare(
      `SELECT * FROM refresh_logs ORDER BY id DESC LIMIT 25`
    )
    .all();

  return NextResponse.json({ logs });
}

export async function POST() {
  const denied = await assertAdmin();
  if (denied) return denied;

  const result = await refreshAllSources();
  return NextResponse.json(result);
}
