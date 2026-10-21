"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type PackageRow = {
  id: number;
  name: string;
  description: string | null;
  device_count: number;
  source_count: number;
};

export function PackagesManager({ packages: initial }: { packages: PackageRow[] }) {
  const router = useRouter();
  const [packages, setPackages] = useState(initial);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createPackage(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setPackages((prev) => [
        { ...data.package, device_count: 0, source_count: 0 },
        ...prev,
      ]);
      setName("");
      setDescription("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function removePackage(id: number) {
    if (!confirm("Delete this package? Device links will be cleared.")) return;
    const res = await fetch(`/api/packages/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Delete failed");
      return;
    }
    setPackages((prev) => prev.filter((p) => p.id !== id));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h2 className="text-xl mb-3">Create package</h2>
        <form onSubmit={createPackage} className="grid gap-3">
          <div className="field">
            <label htmlFor="pkg-name">Name</label>
            <input
              id="pkg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Family plan"
            />
          </div>
          <div className="field">
            <label htmlFor="pkg-desc">Description</label>
            <textarea
              id="pkg-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Shared playlists for a group of devices"
              className="!font-[inherit] !min-h-[4rem]"
            />
          </div>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <button className="btn btn-primary w-fit" disabled={busy} type="submit">
            {busy ? "Saving…" : "Create package"}
          </button>
        </form>
      </section>

      <section className="card p-5">
        <h2 className="text-xl mb-3">Packages</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Devices</th>
                <th>Sources</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {packages.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-[var(--muted)]">
                    No packages yet.
                  </td>
                </tr>
              )}
              {packages.map((pkg) => (
                <tr key={pkg.id}>
                  <td>
                    <div className="font-semibold">{pkg.name}</div>
                    <div className="text-sm text-[var(--muted)]">
                      {pkg.description || "—"}
                    </div>
                  </td>
                  <td>{pkg.device_count}</td>
                  <td>{pkg.source_count}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-danger text-xs"
                      onClick={() => removePackage(pkg.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[var(--muted)] mt-3">
          Attach M3U sources to a package from the Sources page, then assign the
          package to devices.
        </p>
      </section>
    </div>
  );
}
