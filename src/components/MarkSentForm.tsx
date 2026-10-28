"use client";

import { useState } from "react";

type Props = {
  orderId: string;
  opsKey: string;
};

export function MarkSentForm({ orderId, opsKey }: Props) {
  const [tx, setTx] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/ops/transfers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ops-key": opsKey,
        },
        body: JSON.stringify({ orderId, outboundTxHash: tx.trim() }),
      });
      const data = (await res.json()) as { error?: string; ok?: boolean };
      if (!res.ok) throw new Error(data.error || "Failed");
      setMsg("Marked sent");
      window.location.reload();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mark-sent" onSubmit={submit}>
      <input
        value={tx}
        onChange={(e) => setTx(e.target.value)}
        placeholder="tx hash"
        required
      />
      <button type="submit" disabled={busy || !tx.trim()}>
        Mark sent
      </button>
      {msg ? <span className="fineprint">{msg}</span> : null}
    </form>
  );
}
