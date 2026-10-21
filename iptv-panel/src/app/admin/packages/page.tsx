import { PackagesManager } from "@/components/PackagesManager";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function PackagesPage() {
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl mb-1">Packages</h1>
        <p className="text-[var(--muted)] text-sm">
          Shared playlist bundles that can be assigned to multiple devices.
        </p>
      </div>
      <PackagesManager packages={packages as never} />
    </div>
  );
}
