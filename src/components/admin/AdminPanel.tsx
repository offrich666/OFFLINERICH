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

export default function AdminPanel() {
  const [authed, setAuthed] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [wallets, setWallets] = useState<AdminWallet[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetMap, setResetMap] = useState<Record<string, string>>({});
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
    </section>
  );
}
