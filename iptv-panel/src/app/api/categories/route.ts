import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdmin, jsonError } from "@/lib/api";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().min(1),
  sort_order: z.number().int().optional(),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export async function GET() {
  const denied = await assertAdmin();
  if (denied) return denied;

  const database = getDb();
  const categories = database
    .prepare(
      `
      SELECT c.*,
        (SELECT COUNT(*) FROM cached_channels ch WHERE ch.group_title = c.name) AS channel_count
      FROM categories c
      ORDER BY c.sort_order, c.name COLLATE NOCASE
    `
    )
    .all();

  return NextResponse.json({ categories });
}

export async function POST(req: NextRequest) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.message);

  const name = parsed.data.name.trim();
  const slug = slugify(name);
  if (!slug) return jsonError("Invalid category name");

  const database = getDb();
  try {
    const category = database
      .prepare(
        `
        INSERT INTO categories (name, slug, is_builtin, sort_order)
        VALUES (?, ?, 0, ?)
        RETURNING *
      `
      )
      .get(name, slug, parsed.data.sort_order ?? 100);
    return NextResponse.json({ category }, { status: 201 });
  } catch (err) {
    const message = String(err);
    if (message.includes("UNIQUE")) {
      return jsonError("Category already exists", 409);
    }
    return jsonError(message, 500);
  }
}
