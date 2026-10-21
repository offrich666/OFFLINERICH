import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdmin, jsonError } from "@/lib/api";
import { generateToken, getDb, normalizeMac, nowIso } from "@/lib/db";

export const runtime = "nodejs";

const createSchema = z.object({
  mac: z.string().min(1),
  name: z.string().optional().default(""),
  enabled: z.boolean().optional().default(true),
  package_id: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function GET() {
  const denied = await assertAdmin();
  if (denied) return denied;

  const database = getDb();
  const devices = database
    .prepare(
      `
      SELECT d.*, p.name AS package_name,
        (SELECT COUNT(*) FROM playlist_sources s WHERE s.device_id = d.id) AS source_count
      FROM devices d
      LEFT JOIN packages p ON p.id = d.package_id
      ORDER BY d.created_at DESC
    `
    )
    .all();

  return NextResponse.json({ devices });
}

export async function POST(req: NextRequest) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.message);

  let mac: string;
  try {
    mac = normalizeMac(parsed.data.mac);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Invalid MAC");
  }

  const database = getDb();
  try {
    const row = database
      .prepare(
        `
        INSERT INTO devices (mac, name, enabled, token, package_id, notes, created_at, updated_at)
        VALUES (@mac, @name, @enabled, @token, @package_id, @notes, @created_at, @updated_at)
        RETURNING *
      `
      )
      .get({
        mac,
        name: parsed.data.name || mac,
        enabled: parsed.data.enabled ? 1 : 0,
        token: generateToken(),
        package_id: parsed.data.package_id ?? null,
        notes: parsed.data.notes ?? null,
        created_at: nowIso(),
        updated_at: nowIso(),
      });

    return NextResponse.json({ device: row }, { status: 201 });
  } catch (err) {
    const message = String(err);
    if (message.includes("UNIQUE")) {
      return jsonError("A device with this MAC already exists", 409);
    }
    return jsonError(message, 500);
  }
}
