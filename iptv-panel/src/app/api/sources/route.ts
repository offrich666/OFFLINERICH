import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdmin, jsonError } from "@/lib/api";
import { getDb, nowIso, PlaylistSource } from "@/lib/db";
import { refreshSource } from "@/lib/refresh";

export const runtime = "nodejs";

const createSchema = z
  .object({
    name: z.string().min(1),
    source_type: z.enum(["url", "content"]),
    url: z.string().nullable().optional(),
    content: z.string().nullable().optional(),
    package_id: z.number().int().nullable().optional(),
    device_id: z.number().int().nullable().optional(),
    enabled: z.boolean().optional().default(true),
    refresh_now: z.boolean().optional().default(true),
  })
  .superRefine((data, ctx) => {
    const hasPackage = data.package_id != null;
    const hasDevice = data.device_id != null;
    if (hasPackage === hasDevice) {
      ctx.addIssue({
        code: "custom",
        message: "Attach the source to exactly one of package_id or device_id",
      });
    }
    if (data.source_type === "url" && !data.url?.trim()) {
      ctx.addIssue({ code: "custom", message: "URL is required for url sources" });
    }
    if (data.source_type === "content" && !data.content?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "M3U content is required for pasted sources",
      });
    }
  });

export async function GET(req: NextRequest) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const packageId = searchParams.get("package_id");
  const deviceId = searchParams.get("device_id");

  const database = getDb();
  let sources;
  if (packageId) {
    sources = database
      .prepare(`SELECT * FROM playlist_sources WHERE package_id = ? ORDER BY id`)
      .all(Number(packageId));
  } else if (deviceId) {
    sources = database
      .prepare(`SELECT * FROM playlist_sources WHERE device_id = ? ORDER BY id`)
      .all(Number(deviceId));
  } else {
    sources = database
      .prepare(
        `
        SELECT s.*,
          p.name AS package_name,
          d.mac AS device_mac,
          d.name AS device_name
        FROM playlist_sources s
        LEFT JOIN packages p ON p.id = s.package_id
        LEFT JOIN devices d ON d.id = s.device_id
        ORDER BY s.id DESC
      `
      )
      .all();
  }

  return NextResponse.json({ sources });
}

export async function POST(req: NextRequest) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || parsed.error.message);
  }

  const database = getDb();
  const source = database
    .prepare(
      `
      INSERT INTO playlist_sources
        (name, source_type, url, content, package_id, device_id, enabled, created_at, updated_at)
      VALUES
        (@name, @source_type, @url, @content, @package_id, @device_id, @enabled, @created_at, @updated_at)
      RETURNING *
    `
    )
    .get({
      name: parsed.data.name.trim(),
      source_type: parsed.data.source_type,
      url: parsed.data.source_type === "url" ? parsed.data.url?.trim() : null,
      content:
        parsed.data.source_type === "content" ? parsed.data.content : null,
      package_id: parsed.data.package_id ?? null,
      device_id: parsed.data.device_id ?? null,
      enabled: parsed.data.enabled ? 1 : 0,
      created_at: nowIso(),
      updated_at: nowIso(),
    }) as PlaylistSource;

  let refreshError: string | null = null;
  if (parsed.data.refresh_now) {
    try {
      await refreshSource(source);
    } catch (err) {
      refreshError = err instanceof Error ? err.message : String(err);
      database
        .prepare(
          `UPDATE playlist_sources SET last_error = ?, updated_at = ? WHERE id = ?`
        )
        .run(refreshError.slice(0, 1000), nowIso(), source.id);
    }
  }

  const fresh = database
    .prepare("SELECT * FROM playlist_sources WHERE id = ?")
    .get(source.id);

  return NextResponse.json(
    { source: fresh, refreshError },
    { status: 201 }
  );
}
