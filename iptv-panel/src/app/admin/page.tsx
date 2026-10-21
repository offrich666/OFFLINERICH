import Link from "next/link";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function AdminOverviewPage() {
  const database = getDb();
  const stats = database
    .prepare(
      `
      SELECT
        (SELECT COUNT(*) FROM devices) AS devices,
        (SELECT COUNT(*) FROM devices WHERE enabled = 1) AS devices_enabled,
        (SELECT COUNT(*) FROM packages) AS packages,
        (SELECT COUNT(*) FROM playlist_sources) AS sources,
        (SELECT COUNT(*) FROM cached_channels) AS channels
    `
    )
    .get() as {
    devices: number;
    devices_enabled: number;
    packages: number;
    sources: number;
    channels: number;
  };

  const lastRefresh = database
    .prepare(`SELECT * FROM refresh_logs ORDER BY id DESC LIMIT 1`)
    .get() as
    | {
        status: string;
        message: string | null;
        finished_at: string | null;
        started_at: string;
      }
    | undefined;

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl mb-1">Overview</h1>
        <p className="text-[var(--muted)] max-w-2xl">
          Manage MAC devices and attach your own legitimate M3U playlist URLs or
          uploaded content. Built-in sample entries use public demo streams only
          and are labeled as demos.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Devices", value: `${stats.devices_enabled}/${stats.devices}`, href: "/admin/devices" },
          { label: "Packages", value: String(stats.packages), href: "/admin/packages" },
          { label: "Sources", value: String(stats.sources), href: "/admin/sources" },
          { label: "Cached channels", value: String(stats.channels), href: "/admin/refresh" },
        ].map((item) => (
          <Link key={item.label} href={item.href} className="card p-4 hover:border-[var(--accent)] transition-colors">
            <p className="text-sm text-[var(--muted)]">{item.label}</p>
            <p className="text-2xl font-semibold mt-1">{item.value}</p>
          </Link>
        ))}
      </section>

      <section className="card p-5 space-y-3">
        <h2 className="text-xl">Quick start</h2>
        <ol className="list-decimal pl-5 space-y-2 text-sm text-[var(--muted)]">
          <li>
            Create or edit a <Link className="underline text-[var(--accent)]" href="/admin/packages">package</Link> and attach M3U URL(s) or paste M3U content.
          </li>
          <li>
            Add a <Link className="underline text-[var(--accent)]" href="/admin/devices">device</Link> by MAC address and assign the package.
          </li>
          <li>
            Point the STB / player at{" "}
            <code className="mono bg-white px-1 rounded border border-[var(--line)]">
              /api/playlist/&#123;MAC&#125;.m3u?token=…
            </code>
          </li>
          <li>
            Use <Link className="underline text-[var(--accent)]" href="/admin/refresh">Refresh</Link> or the daily cron to re-fetch upstream URLs. Failures keep the last-good cache.
          </li>
        </ol>
      </section>

      <section className="card p-5">
        <h2 className="text-xl mb-2">Last refresh</h2>
        {lastRefresh ? (
          <div className="text-sm space-y-1">
            <p>
              <span
                className={`badge ${
                  lastRefresh.status === "ok"
                    ? "badge-ok"
                    : lastRefresh.status === "running"
                      ? "badge-warn"
                      : "badge-off"
                }`}
              >
                {lastRefresh.status}
              </span>{" "}
              <span className="text-[var(--muted)]">
                {lastRefresh.finished_at || lastRefresh.started_at}
              </span>
            </p>
            <p>{lastRefresh.message}</p>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">No refresh runs yet.</p>
        )}
      </section>
    </div>
  );
}
