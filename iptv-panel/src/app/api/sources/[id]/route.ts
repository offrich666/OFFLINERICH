import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdmin, jsonError } from "@/lib/api";
import { getDb, nowIso, PlaylistSource } from "@/lib/db";
import { refreshSource } from "@/lib/refresh";

export const runtime = "nodejs";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  source_type: z.enum(["url", "content"]).optional(),
  url: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  refresh_now: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const { id } = await ctx.params;
  const database = getDb();
  const source = database
    .prepare("SELECT * FROM playlist_sources WHERE id = ?")
    .get(Number(id));
  if (!source) return jsonError("Source not found", 404);

  const channels = database
    .prepare(
      `SELECT * FROM cached_channels WHERE source_id = ? ORDER BY sort_order, name`
    )
    .all(Number(id));

  return NextResponse.json({ source, channels });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const { id } = await ctx.params;
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.message);

  const database = getDb();
  const existing = database
    .prepare("SELECT * FROM playlist_sources WHERE id = ?")
    .get(Number(id)) as PlaylistSource | undefined;
  if (!existing) return jsonError("Source not found", 404);

  const sourceType = parsed.data.source_type ?? existing.source_type;
  const url =
    parsed.data.url !== undefined
      ? parsed.data.url
      : existing.url;
  const content =
    parsed.data.content !== undefined
      ? parsed.data.content
      : existing.content;

  database
    .prepare(
      `
      UPDATE playlist_sources SET
        name = ?,
        source_type = ?,
        url = ?,
        content = ?,
        enabled = ?,
        updated_at = ?
      WHERE id = ?
    `
    )
    .run(
      parsed.data.name?.trim() ?? existing.name,
      sourceType,
      sourceType === "url" ? url : null,
      sourceType === "content" ? content : null,
      parsed.data.enabled === undefined
        ? existing.enabled
        : parsed.data.enabled
          ? 1
          : 0,
      nowIso(),
      Number(id)
    );

  let refreshError: string | null = null;
  if (parsed.data.refresh_now) {
    const source = database
      .prepare("SELECT * FROM playlist_sources WHERE id = ?")
      .get(Number(id)) as PlaylistSource;
    try {
      await refreshSource(source);
    } catch (err) {
      refreshError = err instanceof Error ? err.message : String(err);
      database
        .prepare(
          `UPDATE playlist_sources SET last_error = ?, updated_at = ? WHERE id = ?`
        )
        .run(refreshError.slice(0, 1000), nowIso(), Number(id));
    }
  }

  const fresh = database
    .prepare("SELECT * FROM playlist_sources WHERE id = ?")
    .get(Number(id));

  return NextResponse.json({ source: fresh, refreshError });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const { id } = await ctx.params;
  const database = getDb();
  const result = database
    .prepare("DELETE FROM playlist_sources WHERE id = ?")
    .run(Number(id));
  if (result.changes === 0) return jsonError("Source not found", 404);
  return NextResponse.json({ ok: true });
}
