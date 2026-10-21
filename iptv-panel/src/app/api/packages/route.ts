import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdmin, jsonError } from "@/lib/api";
import { getDb, nowIso } from "@/lib/db";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
});

export async function GET() {
  const denied = await assertAdmin();
  if (denied) return denied;

  const database = getDb();
  const packages = database
    .prepare(
      `
      SELECT p.*,
        (SELECT COUNT(*) FROM devices d WHERE d.package_id = p.id) AS device_count,
        (SELECT COUNT(*) FROM playlist_sources s WHERE s.package_id = p.id) AS source_count
      FROM packages p
      ORDER BY p.name COLLATE NOCASE
    `
    )
    .all();

  return NextResponse.json({ packages });
}

export async function POST(req: NextRequest) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.message);

  const database = getDb();
  try {
    const pkg = database
      .prepare(
        `
        INSERT INTO packages (name, description, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        RETURNING *
      `
      )
      .get(
        parsed.data.name.trim(),
        parsed.data.description ?? null,
        nowIso(),
        nowIso()
      );
    return NextResponse.json({ package: pkg }, { status: 201 });
  } catch (err) {
    const message = String(err);
    if (message.includes("UNIQUE")) {
      return jsonError("Package name already exists", 409);
    }
    return jsonError(message, 500);
  }
}
