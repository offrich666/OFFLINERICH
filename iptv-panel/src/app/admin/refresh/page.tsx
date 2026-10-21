import { RefreshManager } from "@/components/RefreshManager";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function RefreshPage() {
  const database = getDb();
  const logs = database
    .prepare(`SELECT * FROM refresh_logs ORDER BY id DESC LIMIT 25`)
    .all();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl mb-1">Refresh</h1>
        <p className="text-[var(--muted)] text-sm">
          Re-fetch upstream playlists and review recent job history.
        </p>
      </div>
      <RefreshManager logs={logs as never} />
    </div>
  );
}
