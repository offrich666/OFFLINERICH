"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type LogRow = {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  message: string | null;
  sources_ok: number;
  sources_failed: number;
};

export function RefreshManager({ logs: initial }: { logs: LogRow[] }) {
  const router = useRouter();
  const [logs, setLogs] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runRefresh() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Refresh failed");
      setMessage(data.message);
      const logsRes = await fetch("/api/refresh");
      const logsData = await logsRes.json();
      if (logsRes.ok) setLogs(logsData.logs);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card p-5 space-y-3">
        <h2 className="text-xl">Daily auto-update</h2>
        <p className="text-sm text-[var(--muted)]">
          Upstream URL sources are re-fetched on a schedule (default{" "}
          <code className="mono">0 4 * * *</code> via{" "}
          <code className="mono">CRON_SCHEDULE</code>). Failed fetches log an
          error and keep the last-good cached channels. You can also trigger a
          refresh manually or hit{" "}
          <code className="mono">POST /api/cron/refresh</code>.
        </p>
        <button className="btn btn-primary" disabled={busy} onClick={runRefresh}>
          {busy ? "Refreshing…" : "Refresh all sources now"}
        </button>
        {message && <p className="text-sm text-[var(--ok)]">{message}</p>}
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      </section>

      <section className="card p-5">
        <h2 className="text-xl mb-3">Recent runs</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>Status</th>
                <th>OK / fail</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-[var(--muted)]">
                    No refresh logs yet.
                  </td>
                </tr>
              )}
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="text-sm mono">
                    {log.finished_at || log.started_at}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        log.status === "ok"
                          ? "badge-ok"
                          : log.status === "partial"
                            ? "badge-warn"
                            : "badge-off"
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td className="text-sm">
                    {log.sources_ok} / {log.sources_failed}
                  </td>
                  <td className="text-sm">{log.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
