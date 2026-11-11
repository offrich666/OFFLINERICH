"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Wallet = {
  id: string;
  address: string;
  chain: "evm" | "solana";
  label?: string | null;
};

type Snipe = {
  id: string;
  walletId: string;
  walletAddress: string;
  chain: "evm" | "solana";
  tokenQuery: string;
  tokenAddress?: string | null;
  minLiquidityUsd: number;
  maxSpendNative: string;
  note?: string | null;
  status: "watching" | "ready" | "triggered" | "cancelled";
  pairUrl?: string | null;
  lastLiquidityUsd?: number | null;
  updatedAt: string;
};

function shortAddr(address: string) {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function SniperPanel() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [snipes, setSnipes] = useState<Snipe[]>([]);
  const [walletId, setWalletId] = useState("");
  const [tokenQuery, setTokenQuery] = useState("");
  const [minLiquidityUsd, setMinLiquidityUsd] = useState("1000");
  const [maxSpendNative, setMaxSpendNative] = useState("0.05");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const meRes = await fetch("/api/auth/me");
    const me = (await meRes.json()) as {
      user: { email: string } | null;
      wallets: Wallet[];
    };
    setUserEmail(me.user?.email ?? null);
    setWallets(me.wallets ?? []);
    if (!walletId && me.wallets?.[0]) setWalletId(me.wallets[0].id);

    if (!me.user) {
      setSnipes([]);
      return;
    }
    const snRes = await fetch("/api/snipes");
    if (snRes.ok) {
      const data = (await snRes.json()) as { snipes: Snipe[] };
      setSnipes(data.snipes ?? []);
    }
  }, [walletId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userEmail) return;
    const timer = window.setInterval(() => {
      void (async () => {
        const snRes = await fetch("/api/snipes");
        if (!snRes.ok) return;
        const data = (await snRes.json()) as { snipes: Snipe[] };
        const active = (data.snipes ?? []).filter(
          (s) => s.status === "watching" || s.status === "ready",
        );
        for (const job of active.slice(0, 5)) {
          await fetch("/api/snipes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "check", id: job.id }),
          });
        }
        await refresh();
      })();
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [userEmail, refresh]);

  async function createJob(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/snipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          walletId,
          tokenQuery,
          minLiquidityUsd: Number(minLiquidityUsd),
          maxSpendNative,
          note,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not create snipe");
      setTokenQuery("");
      setNote("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create snipe");
    } finally {
      setBusy(false);
    }
  }

  async function runAction(id: string, action: "cancel" | "check" | "trigger") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/snipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Action failed");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (!userEmail) {
    return (
      <section className="wallet-panel">
        <h2>Sniper</h2>
        <p>
          Create an account, link wallets, then arm snipes from one place.
        </p>
        <div className="wallet-actions">
          <Link href="/auth?next=/sniper" className="primary-cta">
            Create account
          </Link>
          <Link href="/auth?mode=login&next=/sniper" className="secondary-cta">
            Sign in
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="sniper-panel">
      <div className="wallet-panel-copy">
        <h2>Token sniper</h2>
        <p>
          Signed in as <code>{userEmail}</code>. Watch a token / pair; when
          liquidity hits your floor we mark it ready. Buy still needs your
          wallet approval — we never hold private keys.
        </p>
      </div>

      {wallets.length === 0 ? (
        <p className="auth-note">
          Link at least one wallet on <Link href="/tokens">Tokens</Link> before
          sniping.
        </p>
      ) : (
        <form className="auth-form sniper-form" onSubmit={createJob}>
          <label>
            Wallet
            <select
              value={walletId}
              onChange={(e) => setWalletId(e.target.value)}
              required
            >
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {(w.label || w.chain).toString()} · {shortAddr(w.address)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Token / pair / address
            <input
              value={tokenQuery}
              onChange={(e) => setTokenQuery(e.target.value)}
              placeholder="CA, ticker, or pair"
              required
            />
          </label>
          <label>
            Min liquidity (USD)
            <input
              type="number"
              min={0}
              step="1"
              value={minLiquidityUsd}
              onChange={(e) => setMinLiquidityUsd(e.target.value)}
              required
            />
          </label>
          <label>
            Max spend (native)
            <input
              value={maxSpendNative}
              onChange={(e) => setMaxSpendNative(e.target.value)}
              placeholder="0.05"
              required
            />
          </label>
          <label>
            Note
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="optional"
            />
          </label>
          <button type="submit" className="primary-cta" disabled={busy}>
            Arm snipe
          </button>
        </form>
      )}

      {error ? <p className="screener-error">{error}</p> : null}

      <div className="screener-table-wrap">
        <table className="screener-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Token</th>
              <th>Wallet</th>
              <th>Min liq</th>
              <th>Last liq</th>
              <th>Max spend</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {snipes.length === 0 ? (
              <tr>
                <td colSpan={7} className="screener-empty">
                  No snipes yet.
                </td>
              </tr>
            ) : null}
            {snipes.map((s) => (
              <tr key={s.id}>
                <td>
                  <span className={`snipe-status is-${s.status}`}>
                    {s.status}
                  </span>
                </td>
                <td>
                  <strong>{s.tokenQuery}</strong>
                  {s.pairUrl ? (
                    <>
                      <br />
                      <a href={s.pairUrl} target="_blank" rel="noreferrer">
                        Open pair
                      </a>
                    </>
                  ) : null}
                </td>
                <td>
                  <code>{shortAddr(s.walletAddress)}</code>
                </td>
                <td className="num">${s.minLiquidityUsd}</td>
                <td className="num">
                  {s.lastLiquidityUsd != null
                    ? `$${Math.round(s.lastLiquidityUsd)}`
                    : "—"}
                </td>
                <td className="num">{s.maxSpendNative}</td>
                <td>
                  <div className="wallet-actions">
                    <button
                      type="button"
                      className="ghost-link"
                      disabled={busy}
                      onClick={() => void runAction(s.id, "check")}
                    >
                      Check
                    </button>
                    {s.status === "ready" || s.status === "watching" ? (
                      <button
                        type="button"
                        className="secondary-cta"
                        disabled={busy || !s.pairUrl}
                        onClick={() => {
                          if (s.pairUrl) window.open(s.pairUrl, "_blank");
                          void runAction(s.id, "trigger");
                        }}
                      >
                        Approve buy
                      </button>
                    ) : null}
                    {s.status !== "cancelled" && s.status !== "triggered" ? (
                      <button
                        type="button"
                        className="ghost-link"
                        disabled={busy}
                        onClick={() => void runAction(s.id, "cancel")}
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
