import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdmin, jsonError } from "@/lib/api";
import { getDb, nowIso } from "@/lib/db";

export const runtime = "nodejs";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const { id } = await ctx.params;
  const database = getDb();
  const pkg = database
    .prepare("SELECT * FROM packages WHERE id = ?")
    .get(Number(id));
  if (!pkg) return jsonError("Package not found", 404);

  const sources = database
    .prepare(`SELECT * FROM playlist_sources WHERE package_id = ? ORDER BY id`)
    .all(Number(id));
  const devices = database
    .prepare(`SELECT id, mac, name, enabled FROM devices WHERE package_id = ?`)
    .all(Number(id));

  return NextResponse.json({ package: pkg, sources, devices });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const { id } = await ctx.params;
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.message);

  const database = getDb();
  const existing = database
    .prepare("SELECT * FROM packages WHERE id = ?")
    .get(Number(id)) as Record<string, unknown> | undefined;
  if (!existing) return jsonError("Package not found", 404);

  try {
    const pkg = database
      .prepare(
        `
        UPDATE packages SET
          name = ?,
          description = ?,
          updated_at = ?
        WHERE id = ?
        RETURNING *
      `
      )
      .get(
        parsed.data.name?.trim() ?? existing.name,
        parsed.data.description === undefined
          ? existing.description
          : parsed.data.description,
        nowIso(),
        Number(id)
      );
    return NextResponse.json({ package: pkg });
  } catch (err) {
    const message = String(err);
    if (message.includes("UNIQUE")) {
      return jsonError("Package name already exists", 409);
    }
    return jsonError(message, 500);
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const { id } = await ctx.params;
  const database = getDb();
  const result = database.prepare("DELETE FROM packages WHERE id = ?").run(Number(id));
  if (result.changes === 0) return jsonError("Package not found", 404);
  return NextResponse.json({ ok: true });
}
