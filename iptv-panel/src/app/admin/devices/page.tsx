import { headers } from "next/headers";
import { DevicesManager } from "@/components/DevicesManager";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveBaseUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || "http";
  return process.env.PUBLIC_BASE_URL || `${proto}://${host}`;
}

export default async function DevicesPage() {
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
  const packages = database
    .prepare(`SELECT id, name FROM packages ORDER BY name COLLATE NOCASE`)
    .all();
  const baseUrl = await resolveBaseUrl();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl mb-1">Devices</h1>
        <p className="text-[var(--muted)] text-sm">
          Register boxes by MAC address, enable/disable access, and copy their
          stable playlist URL.
        </p>
      </div>
      <DevicesManager
        devices={devices as never}
        packages={packages as never}
        baseUrl={baseUrl}
      />
    </div>
  );
}
