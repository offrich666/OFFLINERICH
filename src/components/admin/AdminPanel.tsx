"use client";

import { useCallback, useEffect, useState } from "react";

type AdminUser = {
  id: string;
  email: string;
  createdAt: string;
  walletCount: number;
};

type AdminWallet = {
  id: string;
  userId: string;
  address: string;
  chain: string;
  label?: string | null;
  balanceNative?: string | null;
  updatedAt: string;
};

type AdminDeposit = {
  id: string;
  userId: string;
  asset: string;
  chain: string;
  amount: number;
  depositAddress: string;
  txHash?: string | null;
  status: string;
};

type AdminWithdraw = {
  id: string;
  userId: string;
  asset: string;
  chain: string;
  amount: number;
  toAddress: string;
  txHash?: string | null;
  status: string;
};

export default function AdminPanel() {
  const [authed, setAuthed] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [wallets, setWallets] = useState<AdminWallet[]>([]);
  const [deposits, setDeposits] = useState<AdminDeposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<AdminWithdraw[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetMap, setResetMap] = useState<Record<string, string>>({});
  const [withdrawTxMap, setWithdrawTxMap] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.status === 401) {
      setAuthed(false);
      return;
    }
    const data = (await res.json()) as {
      users?: AdminUser[];
      wallets?: AdminWallet[];
      error?: string;
    };
    if (!res.ok) throw new Error(data.error || "Failed to load users");
    setUsers(data.users ?? []);
    setWallets(data.wallets ?? []);

    const fundsRes = await fetch("/api/admin/funds");
    if (fundsRes.ok) {
      const funds = (await fundsRes.json()) as {
        deposits?: AdminDeposit[];
        withdrawals?: AdminWithdraw[];
      };
      setDeposits(funds.deposits ?? []);
      setWithdrawals(funds.withdrawals ?? []);
    }
    setAuthed(true);
  }, []);

  useEffect(() => {
    void load().catch(() => setAuthed(false));
  }, [load]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Login failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthed(false);
    setUsers([]);
    setWallets([]);
  }

  async function resetPassword(userId: string) {
    const newPassword = resetMap[userId]?.trim() ?? "";
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, newPassword }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Reset failed");
      setNotice(`Password reset for ${userId}`);
      setResetMap((prev) => ({ ...prev, [userId]: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  async function fundsAction(
    action: string,
    payload: Record<string, string>,
  ) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Funds action failed");
      setNotice(`Funds action ok: ${action}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Funds action failed");
    } finally {
      setBusy(false);
    }
  }

  if (!authed) {
    return (
      <section className="auth-panel">
        <h2 className="tokens-title" style={{ fontSize: "1.6rem" }}>
          Admin login
        </h2>
        <form className="auth-form" onSubmit={login}>
          <label>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit" className="primary-cta" disabled={busy}>
            Enter admin
          </button>
        </form>
        {error ? <p className="screener-error">{error}</p> : null}
      </section>
    );
  }

  return (
    <section className="admin-panel">
      <div className="wallet-session-row">
        <span className="wallet-pill">Admin</span>
        <span>{users.length} users</span>
        <button type="button" className="ghost-link" onClick={() => void logout()}>
          Sign out
        </button>
      </div>

      {notice ? <p className="wallet-synced">{notice}</p> : null}
      {error ? <p className="screener-error">{error}</p> : null}

      <div className="screener-table-wrap">
        <table className="screener-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>User ID</th>
              <th>Wallets</th>
              <th>Created</th>
              <th>Reset password</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} className="screener-empty">
                  No registered users yet.
                </td>
              </tr>
            ) : null}
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>
                  <code>{u.id}</code>
                </td>
                <td className="num">{u.walletCount}</td>
                <td>
                  {new Date(u.createdAt).toLocaleString("en-GB", {
                    timeZone: "Europe/Warsaw",
                  })}
                </td>
                <td>
                  <div className="admin-reset">
                    <input
                      type="password"
                      placeholder="New password"
                      value={resetMap[u.id] ?? ""}
                      onChange={(e) =>
                        setResetMap((prev) => ({
                          ...prev,
                          [u.id]: e.target.value,
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="secondary-cta"
                      disabled={busy}
                      onClick={() => void resetPassword(u.id)}
                    >
                      Reset
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="admin-subhead">Linked wallets (addresses only)</h3>
      <div className="screener-table-wrap">
        <table className="screener-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Chain</th>
              <th>Address</th>
              <th>Label</th>
              <th>Balance</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {wallets.length === 0 ? (
              <tr>
                <td colSpan={6} className="screener-empty">
                  No wallets linked yet.
                </td>
              </tr>
            ) : null}
            {wallets.map((w) => (
              <tr key={w.id}>
                <td>
                  <code>{w.userId}</code>
                </td>
                <td>{w.chain}</td>
                <td>
                  <code>{w.address}</code>
                </td>
                <td>{w.label || "—"}</td>
                <td>{w.balanceNative || "—"}</td>
                <td>
                  {new Date(w.updatedAt).toLocaleString("en-GB", {
                    timeZone: "Europe/Warsaw",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="admin-subhead">Deposits</h3>
      <div className="screener-table-wrap">
        <table className="screener-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>User</th>
              <th>Amount</th>
              <th>Address</th>
              <th>Tx</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {deposits.length === 0 ? (
              <tr>
                <td colSpan={6} className="screener-empty">
                  No deposits.
                </td>
              </tr>
            ) : null}
            {deposits.map((d) => (
              <tr key={d.id}>
                <td>{d.status}</td>
                <td>
                  <code>{d.userId}</code>
                </td>
                <td className="num">
                  {d.amount} {d.asset}
                </td>
                <td>
                  <code>{d.depositAddress}</code>
                </td>
                <td>
                  <code>{d.txHash || "—"}</code>
                </td>
                <td>
                  <div className="wallet-actions">
                    <button
                      type="button"
                      className="secondary-cta"
                      disabled={busy || d.status === "credited"}
                      onClick={() =>
                        void fundsAction("credit_deposit", {
                          depositId: d.id,
                        })
                      }
                    >
                      Credit
                    </button>
                    <button
                      type="button"
                      className="ghost-link"
                      disabled={busy || d.status === "credited"}
                      onClick={() =>
                        void fundsAction("reject_deposit", {
                          depositId: d.id,
                        })
                      }
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="admin-subhead">Withdrawals</h3>
      <div className="screener-table-wrap">
        <table className="screener-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>User</th>
              <th>Amount</th>
              <th>To</th>
              <th>Mark sent</th>
            </tr>
          </thead>
          <tbody>
            {withdrawals.length === 0 ? (
              <tr>
                <td colSpan={5} className="screener-empty">
                  No withdrawals.
                </td>
              </tr>
            ) : null}
            {withdrawals.map((w) => (
              <tr key={w.id}>
                <td>{w.status}</td>
                <td>
                  <code>{w.userId}</code>
                </td>
                <td className="num">
                  {w.amount} {w.asset}
                </td>
                <td>
                  <code>{w.toAddress}</code>
                </td>
                <td>
                  {w.status === "requested" || w.status === "processing" ? (
                    <div className="admin-reset">
                      <input
                        placeholder="Outbound tx hash"
                        value={withdrawTxMap[w.id] ?? ""}
                        onChange={(e) =>
                          setWithdrawTxMap((prev) => ({
                            ...prev,
                            [w.id]: e.target.value,
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="secondary-cta"
                        disabled={busy}
                        onClick={() =>
                          void fundsAction("send_withdraw", {
                            withdrawId: w.id,
                            txHash: withdrawTxMap[w.id] ?? "",
                          })
                        }
                      >
                        Mark sent
                      </button>
                      <button
                        type="button"
                        className="ghost-link"
                        disabled={busy}
                        onClick={() =>
                          void fundsAction("reject_withdraw", {
                            withdrawId: w.id,
                          })
                        }
                      >
                        Reject
                      </button>
                    </div>
                  ) : (
                    <code>{w.txHash || "—"}</code>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
