import { NextRequest, NextResponse } from "next/server";
import { assertAdmin, jsonError } from "@/lib/api";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const { id } = await ctx.params;
  const database = getDb();
  const category = database
    .prepare("SELECT * FROM categories WHERE id = ?")
    .get(Number(id)) as { is_builtin: number } | undefined;

  if (!category) return jsonError("Category not found", 404);
  if (category.is_builtin) {
    return jsonError("Built-in categories cannot be deleted", 400);
  }

  database.prepare("DELETE FROM categories WHERE id = ?").run(Number(id));
  return NextResponse.json({ ok: true });
}
