"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      className="fxl-btn fxl-btn-ghost"
      onClick={logout}
      disabled={busy}
    >
      {busy ? "…" : "Log out"}
    </button>
  );
}
