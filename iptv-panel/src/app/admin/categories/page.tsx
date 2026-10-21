import { CategoriesManager } from "@/components/CategoriesManager";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function CategoriesPage() {
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl mb-1">Categories</h1>
        <p className="text-[var(--muted)] text-sm">
          Organize channels via M3U group-title values.
        </p>
      </div>
      <CategoriesManager categories={categories as never} />
    </div>
  );
}
