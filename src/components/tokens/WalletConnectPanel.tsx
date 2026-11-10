"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  connectEvmWallet,
  connectSolanaWallet,
  detectWallets,
  registerConnectedWallet,
  type ConnectedSession,
} from "@/lib/walletClient";

type MeResponse = {
  user: { id: string; email: string } | null;
  wallets: Array<{
    id: string;
    address: string;
    chain: "evm" | "solana";
    chainId?: string | number | null;
    label?: string | null;
    balanceNative?: string | null;
  }>;
  maxWallets: number;
};

function shortAddr(address: string) {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function WalletConnectPanel() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [available, setAvailable] = useState({ evm: false, solana: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<ConnectedSession | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/auth/me");
    const data = (await res.json()) as MeResponse;
    setMe(data);
  }, []);

  useEffect(() => {
    setAvailable(detectWallets());
    void refresh();
  }, [refresh]);

  async function connect(kind: "evm" | "solana") {
    if (!me?.user) {
      setError("Create an account first, then connect wallets.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next =
        kind === "evm" ? await connectEvmWallet() : await connectSolanaWallet();
      await registerConnectedWallet(next);
      setLast(next);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connect failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeWallet(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/wallets?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Remove failed");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setLast(null);
    await refresh();
  }

  const count = me?.wallets.length ?? 0;
  const max = me?.maxWallets ?? 300;

  return (
    <section className="wallet-panel" aria-label="Account wallets">
      <div className="wallet-panel-copy">
        <h2>Account & wallets</h2>
        <p>
          Register first, then connect up to {max} wallets. Manage them here and
          use them in the sniper. Keys stay in MetaMask / Phantom — we only keep
          addresses and signed ownership proofs.
        </p>
      </div>

      {!me?.user ? (
        <div className="wallet-actions">
          <Link href="/auth?next=/tokens" className="primary-cta">
            Create account
          </Link>
          <Link href="/auth?mode=login&next=/tokens" className="secondary-cta">
            Sign in
          </Link>
        </div>
      ) : (
        <>
          <div className="wallet-session">
            <div className="wallet-session-row">
              <span className="wallet-pill">Signed in</span>
              <code>{me.user.email}</code>
              <span className="wallet-balance">
                {count}/{max} wallets
              </span>
            </div>
            <div className="wallet-actions">
              <button
                type="button"
                className="primary-cta"
                disabled={busy || !available.evm || count >= max}
                onClick={() => void connect("evm")}
              >
                Connect EVM
              </button>
              <button
                type="button"
                className="secondary-cta"
                disabled={busy || !available.solana || count >= max}
                onClick={() => void connect("solana")}
              >
                Connect Solana
              </button>
              <Link href="/sniper" className="ghost-link">
                Open sniper
              </Link>
              <button
                type="button"
                className="ghost-link"
                disabled={busy}
                onClick={() => void logout()}
              >
                Sign out
              </button>
            </div>
            {last ? (
              <p className="wallet-session-meta">
                Last linked: {last.label} · {shortAddr(last.address)}
                {last.balanceNative ? ` · ${last.balanceNative}` : ""}
              </p>
            ) : null}
          </div>

          <div className="wallet-list">
            {me.wallets.length === 0 ? (
              <p className="auth-note">No wallets linked yet.</p>
            ) : (
              <table className="screener-table wallet-table">
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Chain</th>
                    <th>Address</th>
                    <th>Balance</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {me.wallets.map((w) => (
                    <tr key={w.id}>
                      <td>{w.label || "—"}</td>
                      <td>
                        {w.chain}
                        {w.chainId != null ? ` · ${w.chainId}` : ""}
                      </td>
                      <td>
                        <code title={w.address}>{shortAddr(w.address)}</code>
                      </td>
                      <td>{w.balanceNative || "—"}</td>
                      <td>
                        <button
                          type="button"
                          className="ghost-link"
                          disabled={busy}
                          onClick={() => void removeWallet(w.id)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {error ? <p className="screener-error">{error}</p> : null}
    </section>
  );
}
