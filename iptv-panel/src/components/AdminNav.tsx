"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const links = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/devices", label: "Devices" },
  { href: "/admin/packages", label: "Packages" },
  { href: "/admin/sources", label: "Sources" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/refresh", label: "Refresh" },
];

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] backdrop-blur sticky top-0 z-20">
      <div className="mx-auto max-w-6xl px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/admin" className="brand text-lg text-[var(--accent)]">
            BIGBROTHER IPTV
          </Link>
          <p className="text-xs text-[var(--muted)]">Playlist management panel</p>
        </div>
        <nav className="flex flex-wrap gap-1.5 items-center">
          {links.map((link) => {
            const active = link.exact
              ? pathname === link.href
              : pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`btn text-sm ${active ? "btn-primary" : "btn-ghost"}`}
              >
                {link.label}
              </Link>
            );
          })}
          <button type="button" className="btn btn-ghost text-sm" onClick={logout}>
            Log out
          </button>
        </nav>
      </div>
    </header>
  );
}
