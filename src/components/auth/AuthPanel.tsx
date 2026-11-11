"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "register" | "login";

export default function AuthPanel({
  initialMode = "register",
  nextPath = "/tokens",
}: {
  initialMode?: Mode;
  nextPath?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Auth failed");
      router.push(nextPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-panel">
      <div className="auth-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={mode === "register" ? "is-active" : undefined}
          onClick={() => setMode("register")}
        >
          Create account
        </button>
        <button
          type="button"
          role="tab"
          className={mode === "login" ? "is-active" : undefined}
          onClick={() => setMode("login")}
        >
          Sign in
        </button>
      </div>

      <form className="auth-form" onSubmit={submit}>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </label>
        <button type="submit" className="primary-cta" disabled={busy}>
          {busy
            ? "Please wait…"
            : mode === "register"
              ? "Create account"
              : "Sign in"}
        </button>
      </form>

      {error ? <p className="screener-error">{error}</p> : null}

      <p className="auth-note">
        Account first, then connect up to 300 wallets and manage snipes from one
        place. Private keys stay in your wallet apps — we only store addresses +
        signed proofs.
      </p>
    </section>
  );
}
