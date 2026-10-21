"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type PackageOption = { id: number; name: string };
type DeviceOption = { id: number; mac: string; name: string };
type SourceRow = {
  id: number;
  name: string;
  source_type: "url" | "content";
  url: string | null;
  enabled: number;
  last_fetched_at: string | null;
  last_error: string | null;
  last_channel_count: number;
  package_id: number | null;
  device_id: number | null;
  package_name?: string | null;
  device_mac?: string | null;
  device_name?: string | null;
};

export function SourcesManager({
  sources: initial,
  packages,
  devices,
}: {
  sources: SourceRow[];
  packages: PackageOption[];
  devices: DeviceOption[];
}) {
  const router = useRouter();
  const [sources, setSources] = useState(initial);
  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState<"url" | "content">("url");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");
  const [attachTo, setAttachTo] = useState<"package" | "device">("package");
  const [packageId, setPackageId] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    setSourceType("content");
    setContent(text);
    if (!name) setName(file.name.replace(/\.m3u8?$/i, ""));
  }

  async function createSource(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const body = {
        name,
        source_type: sourceType,
        url: sourceType === "url" ? url : null,
        content: sourceType === "content" ? content : null,
        package_id: attachTo === "package" ? Number(packageId) : null,
        device_id: attachTo === "device" ? Number(deviceId) : null,
        refresh_now: true,
      };
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      const enriched: SourceRow = {
        ...data.source,
        package_name:
          packages.find((p) => p.id === data.source.package_id)?.name ?? null,
        device_mac:
          devices.find((d) => d.id === data.source.device_id)?.mac ?? null,
        device_name:
          devices.find((d) => d.id === data.source.device_id)?.name ?? null,
      };
      setSources((prev) => [enriched, ...prev]);
      if (data.refreshError) {
        setInfo(`Saved, but refresh failed (cache empty): ${data.refreshError}`);
      } else {
        setInfo(`Saved and cached ${data.source.last_channel_count} channel(s).`);
      }
      setName("");
      setUrl("");
      setContent("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(source: SourceRow) {
    const res = await fetch(`/api/sources/${source.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !source.enabled }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Update failed");
      return;
    }
    setSources((prev) =>
      prev.map((s) => (s.id === source.id ? { ...s, ...data.source } : s))
    );
  }

  async function refreshOne(id: number) {
    setInfo(null);
    const res = await fetch(`/api/sources/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_now: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Refresh failed");
      return;
    }
    setSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...data.source } : s))
    );
    if (data.refreshError) {
      setInfo(`Refresh failed; last-good cache kept. ${data.refreshError}`);
    } else {
      setInfo(`Refreshed source #${id} (${data.source.last_channel_count} channels).`);
    }
    router.refresh();
  }

  async function removeSource(id: number) {
    if (!confirm("Delete this source and its cached channels?")) return;
    const res = await fetch(`/api/sources/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Delete failed");
      return;
    }
    setSources((prev) => prev.filter((s) => s.id !== id));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="card p-5 space-y-3">
        <h2 className="text-xl">Add playlist source</h2>
        <p className="text-sm text-[var(--muted)]">
          Paste a legitimate upstream M3U URL, paste M3U text, or upload an{" "}
          <code className="mono">.m3u</code> / <code className="mono">.m3u8</code>{" "}
          file. Do not add pirated or scraped stream lists.
        </p>
        <form onSubmit={createSource} className="grid gap-3">
          <div className="field">
            <label htmlFor="src-name">Name</label>
            <input
              id="src-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Provider playlist"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="src-type">Source type</label>
              <select
                id="src-type"
                value={sourceType}
                onChange={(e) =>
                  setSourceType(e.target.value as "url" | "content")
                }
              >
                <option value="url">Upstream M3U URL</option>
                <option value="content">Paste / upload M3U</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="attach">Attach to</label>
              <select
                id="attach"
                value={attachTo}
                onChange={(e) =>
                  setAttachTo(e.target.value as "package" | "device")
                }
              >
                <option value="package">Shared package</option>
                <option value="device">Single device</option>
              </select>
            </div>
          </div>

          {attachTo === "package" ? (
            <div className="field">
              <label htmlFor="pkg">Package</label>
              <select
                id="pkg"
                value={packageId}
                onChange={(e) => setPackageId(e.target.value)}
                required
              >
                <option value="">Select package…</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="field">
              <label htmlFor="dev">Device</label>
              <select
                id="dev"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                required
              >
                <option value="">Select device…</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.mac} — {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {sourceType === "url" ? (
            <div className="field">
              <label htmlFor="url">M3U URL</label>
              <input
                id="url"
                type="url"
                className="mono"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                placeholder="https://example.com/playlist.m3u"
              />
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="file">Upload M3U file</label>
                <input
                  id="file"
                  type="file"
                  accept=".m3u,.m3u8,audio/x-mpegurl,application/vnd.apple.mpegurl,text/plain"
                  onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="field">
                <label htmlFor="content">M3U content</label>
                <textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                  placeholder={"#EXTM3U\n#EXTINF:-1 group-title=\"International\",Channel\nhttps://..."}
                />
              </div>
            </>
          )}

          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          {info && <p className="text-sm text-[var(--ok)]">{info}</p>}
          <button className="btn btn-primary w-fit" disabled={busy} type="submit">
            {busy ? "Saving…" : "Add source"}
          </button>
        </form>
      </section>

      <section className="card p-5">
        <h2 className="text-xl mb-3">Configured sources</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Source</th>
                <th>Attached to</th>
                <th>Cache</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sources.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-[var(--muted)]">
                    No sources yet — add a legitimate M3U URL or paste content above.
                  </td>
                </tr>
              )}
              {sources.map((source) => (
                <tr key={source.id}>
                  <td>
                    <div className="font-semibold">{source.name}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {source.source_type === "url" ? (
                        <span className="mono break-all">{source.url}</span>
                      ) : (
                        "pasted / uploaded M3U"
                      )}
                    </div>
                  </td>
                  <td className="text-sm">
                    {source.package_name
                      ? `Package: ${source.package_name}`
                      : source.device_mac
                        ? `Device: ${source.device_mac}`
                        : "—"}
                  </td>
                  <td className="text-sm">
                    {source.last_channel_count} channels
                    <div className="text-xs text-[var(--muted)]">
                      {source.last_fetched_at || "never fetched"}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${source.enabled ? "badge-ok" : "badge-off"}`}>
                      {source.enabled ? "on" : "off"}
                    </span>
                    {source.last_error && (
                      <div className="text-xs text-[var(--danger)] mt-1 max-w-[14rem]">
                        {source.last_error}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="btn btn-ghost text-xs"
                        onClick={() => toggleEnabled(source)}
                      >
                        {source.enabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost text-xs"
                        onClick={() => refreshOne(source.id)}
                      >
                        Refresh
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger text-xs"
                        onClick={() => removeSource(source.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
