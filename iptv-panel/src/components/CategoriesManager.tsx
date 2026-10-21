"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type CategoryRow = {
  id: number;
  name: string;
  slug: string;
  is_builtin: number;
  sort_order: number;
  channel_count: number;
};

export function CategoriesManager({
  categories: initial,
}: {
  categories: CategoryRow[];
}) {
  const router = useRouter();
  const [categories, setCategories] = useState(initial);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createCategory(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setCategories((prev) => [
        ...prev,
        { ...data.category, channel_count: 0 },
      ]);
      setName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeCategory(id: number) {
    if (!confirm("Delete this custom category?")) return;
    const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Delete failed");
      return;
    }
    setCategories((prev) => prev.filter((c) => c.id !== id));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h2 className="text-xl mb-2">Categories</h2>
        <p className="text-sm text-[var(--muted)] mb-4">
          Channel <code className="mono">group-title</code> values map to these
          categories in delivered M3U playlists. Built-ins: International,
          Albanian Sports, Big Brother / Reality.
        </p>
        <form onSubmit={createCategory} className="flex flex-col sm:flex-row gap-3">
          <div className="field flex-1">
            <label htmlFor="cat-name">Custom category name</label>
            <input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Kids"
            />
          </div>
          <div className="flex items-end">
            <button className="btn btn-primary" disabled={busy} type="submit">
              {busy ? "Adding…" : "Add category"}
            </button>
          </div>
        </form>
        {error && <p className="text-sm text-[var(--danger)] mt-2">{error}</p>}
      </section>

      <section className="card p-5">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Cached channels</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.id}>
                  <td>
                    <div className="font-semibold">{cat.name}</div>
                    {cat.is_builtin ? (
                      <span className="badge badge-ok mt-1">built-in</span>
                    ) : (
                      <span className="badge badge-off mt-1">custom</span>
                    )}
                  </td>
                  <td className="mono text-sm">{cat.slug}</td>
                  <td>{cat.channel_count}</td>
                  <td>
                    {!cat.is_builtin && (
                      <button
                        type="button"
                        className="btn btn-danger text-xs"
                        onClick={() => removeCategory(cat.id)}
                      >
                        Delete
                      </button>
                    )}
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
