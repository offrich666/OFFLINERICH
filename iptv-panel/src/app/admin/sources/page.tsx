import { SourcesManager } from "@/components/SourcesManager";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function SourcesPage() {
  const database = getDb();
  const sources = database
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
  const packages = database
    .prepare(`SELECT id, name FROM packages ORDER BY name COLLATE NOCASE`)
    .all();
  const devices = database
    .prepare(`SELECT id, mac, name FROM devices ORDER BY mac`)
    .all();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl mb-1">Playlist sources</h1>
        <p className="text-[var(--muted)] text-sm">
          Owner-supplied M3U URLs and files only — no scraped or pirated lists
          ship with this panel.
        </p>
      </div>
      <SourcesManager
        sources={sources as never}
        packages={packages as never}
        devices={devices as never}
      />
    </div>
  );
}
