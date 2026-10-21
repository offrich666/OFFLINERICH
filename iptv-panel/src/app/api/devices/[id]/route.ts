import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdmin, jsonError } from "@/lib/api";
import { generateToken, getDb, normalizeMac, nowIso } from "@/lib/db";

export const runtime = "nodejs";

const updateSchema = z.object({
  mac: z.string().optional(),
  name: z.string().optional(),
  enabled: z.boolean().optional(),
  package_id: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
  regenerate_token: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const { id } = await ctx.params;
  const database = getDb();
  const device = database
    .prepare(
      `
      SELECT d.*, p.name AS package_name
      FROM devices d
      LEFT JOIN packages p ON p.id = d.package_id
      WHERE d.id = ?
    `
    )
    .get(Number(id));

  if (!device) return jsonError("Device not found", 404);

  const sources = database
    .prepare(`SELECT * FROM playlist_sources WHERE device_id = ? ORDER BY id`)
    .all(Number(id));

  return NextResponse.json({ device, sources });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const { id } = await ctx.params;
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.message);

  const database = getDb();
  const existing = database
    .prepare("SELECT * FROM devices WHERE id = ?")
    .get(Number(id)) as Record<string, unknown> | undefined;
  if (!existing) return jsonError("Device not found", 404);

  let mac = existing.mac as string;
  if (parsed.data.mac) {
    try {
      mac = normalizeMac(parsed.data.mac);
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : "Invalid MAC");
    }
  }

  try {
    const device = database
      .prepare(
        `
        UPDATE devices SET
          mac = @mac,
          name = @name,
          enabled = @enabled,
          package_id = @package_id,
          notes = @notes,
          token = @token,
          updated_at = @updated_at
        WHERE id = @id
        RETURNING *
      `
      )
      .get({
        id: Number(id),
        mac,
        name: parsed.data.name ?? existing.name,
        enabled:
          parsed.data.enabled === undefined
            ? existing.enabled
            : parsed.data.enabled
              ? 1
              : 0,
        package_id:
          parsed.data.package_id === undefined
            ? existing.package_id
            : parsed.data.package_id,
        notes:
          parsed.data.notes === undefined ? existing.notes : parsed.data.notes,
        token: parsed.data.regenerate_token
          ? generateToken()
          : existing.token,
        updated_at: nowIso(),
      });

    return NextResponse.json({ device });
  } catch (err) {
    const message = String(err);
    if (message.includes("UNIQUE")) {
      return jsonError("A device with this MAC already exists", 409);
    }
    return jsonError(message, 500);
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const { id } = await ctx.params;
  const database = getDb();
  const result = database.prepare("DELETE FROM devices WHERE id = ?").run(Number(id));
  if (result.changes === 0) return jsonError("Device not found", 404);
  return NextResponse.json({ ok: true });
}
