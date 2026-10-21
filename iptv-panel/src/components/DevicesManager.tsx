"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type PackageOption = { id: number; name: string };
type DeviceRow = {
  id: number;
  mac: string;
  name: string;
  enabled: number;
  token: string;
  package_id: number | null;
  package_name: string | null;
  source_count: number;
  notes: string | null;
};

export function DevicesManager({
  devices: initial,
  packages,
  baseUrl,
}: {
  devices: DeviceRow[];
  packages: PackageOption[];
  baseUrl: string;
}) {
  const router = useRouter();
  const [devices, setDevices] = useState(initial);
  const [mac, setMac] = useState("");
  const [name, setName] = useState("");
  const [packageId, setPackageId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);

  const sorted = useMemo(
    () => [...devices].sort((a, b) => a.mac.localeCompare(b.mac)),
    [devices]
  );

  function playlistUrl(device: DeviceRow) {
    const macPath = encodeURIComponent(device.mac);
    return `${baseUrl}/api/playlist/${macPath}.m3u?token=${device.token}`;
  }

  async function createDevice(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mac,
          name,
          package_id: packageId ? Number(packageId) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create device");
      setDevices((prev) => [
        {
          ...data.device,
          package_name:
            packages.find((p) => p.id === data.device.package_id)?.name ?? null,
          source_count: 0,
        },
        ...prev,
      ]);
      setMac("");
      setName("");
      setPackageId("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function patchDevice(id: number, body: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/devices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Update failed");
      return;
    }
    setDevices((prev) =>
      prev.map((d) =>
        d.id === id
          ? {
              ...d,
              ...data.device,
              package_name:
                packages.find((p) => p.id === data.device.package_id)?.name ??
                null,
            }
          : d
      )
    );
    router.refresh();
  }

  async function removeDevice(id: number) {
    if (!confirm("Delete this device?")) return;
    const res = await fetch(`/api/devices/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Delete failed");
      return;
    }
    setDevices((prev) => prev.filter((d) => d.id !== id));
    router.refresh();
  }

  async function copyUrl(device: DeviceRow) {
    await navigator.clipboard.writeText(playlistUrl(device));
    setCopied(device.id);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h2 className="text-xl mb-3">Add device</h2>
        <form onSubmit={createDevice} className="grid gap-3 sm:grid-cols-2">
          <div className="field">
            <label htmlFor="mac">MAC address</label>
            <input
              id="mac"
              className="mono"
              placeholder="AA:BB:CC:DD:EE:FF"
              value={mac}
              onChange={(e) => setMac(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="name">Display name</label>
            <input
              id="name"
              placeholder="Living room box"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field sm:col-span-2">
            <label htmlFor="package">Shared package (optional)</label>
            <select
              id="package"
              value={packageId}
              onChange={(e) => setPackageId(e.target.value)}
            >
              <option value="">— none —</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-[var(--danger)] sm:col-span-2">{error}</p>}
          <div className="sm:col-span-2">
            <button className="btn btn-primary" disabled={busy} type="submit">
              {busy ? "Saving…" : "Add device"}
            </button>
          </div>
        </form>
      </section>

      <section className="card p-5">
        <h2 className="text-xl mb-3">Devices</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>MAC / name</th>
                <th>Package</th>
                <th>Status</th>
                <th>Playlist URL</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-[var(--muted)]">
                    No devices yet.
                  </td>
                </tr>
              )}
              {sorted.map((device) => (
                <tr key={device.id}>
                  <td>
                    <div className="mono font-semibold">{device.mac}</div>
                    <div className="text-sm text-[var(--muted)]">{device.name}</div>
                  </td>
                  <td className="text-sm">
                    <select
                      className="w-full border border-[var(--line)] rounded-lg px-2 py-1 bg-white"
                      value={device.package_id ?? ""}
                      onChange={(e) =>
                        patchDevice(device.id, {
                          package_id: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                    >
                      <option value="">— none —</option>
                      {packages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <div className="text-xs text-[var(--muted)] mt-1">
                      {device.source_count} device source
                      {device.source_count === 1 ? "" : "s"}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${device.enabled ? "badge-ok" : "badge-off"}`}>
                      {device.enabled ? "enabled" : "disabled"}
                    </span>
                  </td>
                  <td className="max-w-[18rem]">
                    <code className="mono text-xs break-all">
                      {playlistUrl(device)}
                    </code>
                    <div className="mt-1">
                      <button
                        type="button"
                        className="btn btn-ghost text-xs"
                        onClick={() => copyUrl(device)}
                      >
                        {copied === device.id ? "Copied" : "Copy URL"}
                      </button>
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="btn btn-ghost text-xs"
                        onClick={() =>
                          patchDevice(device.id, { enabled: !device.enabled })
                        }
                      >
                        {device.enabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost text-xs"
                        onClick={() =>
                          patchDevice(device.id, { regenerate_token: true })
                        }
                      >
                        New token
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger text-xs"
                        onClick={() => removeDevice(device.id)}
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
        <p className="text-xs text-[var(--muted)] mt-3">
          Tip: attach per-device M3U sources from the Sources page, or assign a
          shared package. Set <code className="mono">REQUIRE_PLAYLIST_TOKEN=1</code>{" "}
          to require the token query param.
        </p>
      </section>
    </div>
  );
}
