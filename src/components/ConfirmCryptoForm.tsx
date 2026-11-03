"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ConfirmCryptoForm({
  invoiceId,
  opsKey,
}: {
  invoiceId: string;
  opsKey: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/ops/confirm-crypto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, key: opsKey }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className="fxl-btn"
        style={{ marginTop: "0.5rem" }}
        disabled={busy}
        onClick={confirm}
      >
        {busy ? "Confirming…" : "Mark paid & activate account"}
      </button>
      {error ? <p className="fxl-error">{error}</p> : null}
    </div>
  );
}
