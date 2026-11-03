"use client";

import { useMemo, useState } from "react";
import {
  ACCOUNT_SIZES,
  PROGRAMS,
  type AccountSize,
  type ChallengeProgram,
  formatAccountSize,
  formatUsd,
  getChallengePrice,
} from "@/lib/challenges";

type DepositAddress = {
  network: string;
  label: string;
  asset: string;
  address: string;
};

type Props = {
  initialProgram?: ChallengeProgram;
  highlightReactivation?: boolean;
  signedIn: boolean;
};

export function ChallengeBuyer({
  initialProgram = "instant",
  highlightReactivation = false,
  signedIn,
}: Props) {
  const [program, setProgram] = useState<ChallengeProgram>(initialProgram);
  const [size, setSize] = useState<AccountSize>(
    highlightReactivation ? 5000 : 10000,
  );
  const [method, setMethod] = useState<"card" | "crypto">("card");
  const [network, setNetwork] = useState<"solana" | "bsc" | "tron">("tron");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cryptoResult, setCryptoResult] = useState<{
    invoiceId: string;
    address: string;
    amountUsd: number;
    asset: string;
    network: string;
  } | null>(null);
  const [deposits, setDeposits] = useState<DepositAddress[] | null>(null);

  const price = useMemo(() => getChallengePrice(program, size), [program, size]);
  const isReactivation = program === "instant" && size === 5000;

  async function loadDeposits() {
    if (deposits) return;
    const res = await fetch("/api/crypto/addresses");
    const data = (await res.json()) as { addresses?: DepositAddress[] };
    setDeposits(data.addresses || []);
  }

  async function payCard() {
    setError("");
    setBusy(true);
    setCryptoResult(null);
    try {
      if (!signedIn) {
        window.location.href = `/login?next=/challenges?program=${program}`;
        return;
      }
      const res = await fetch("/api/checkout/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ program, size, method: "card" }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error || "Could not start card checkout");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error starting checkout");
    } finally {
      setBusy(false);
    }
  }

  async function payCrypto() {
    setError("");
    setBusy(true);
    try {
      if (!signedIn) {
        window.location.href = `/login?next=/challenges?program=${program}`;
        return;
      }
      await loadDeposits();
      const res = await fetch("/api/checkout/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ program, size, method: "crypto", network }),
      });
      const data = (await res.json()) as {
        invoice?: {
          id: string;
          address: string;
          amountUsd: number;
          asset: string;
          network: string;
        };
        error?: string;
      };
      if (!res.ok || !data.invoice) {
        setError(data.error || "Could not create crypto invoice");
        return;
      }
      setCryptoResult({
        invoiceId: data.invoice.id,
        address: data.invoice.address,
        amountUsd: data.invoice.amountUsd,
        asset: data.invoice.asset,
        network: data.invoice.network,
      });
    } catch {
      setError("Network error creating crypto invoice");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fxl-panel">
      <h1>Get your funded account</h1>
      <p className="fxl-muted">
        Professional challenges from $5K to $1M. Pay by card or USDT crypto.
      </p>

      <div className="fxl-tabs" role="tablist">
        {PROGRAMS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`fxl-tab${program === p.id ? " active" : ""}`}
            onClick={() => setProgram(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>

      {highlightReactivation || isReactivation ? (
        <div className="fxl-account fxl-reactivation" style={{ marginBottom: "1rem" }}>
          <strong>Reactivation package</strong>
          <p className="fxl-muted" style={{ margin: 0 }}>
            Instant 5K · {formatUsd(500)} — unlocks legacy $1,500 profit from the old
            server after purchase.
          </p>
        </div>
      ) : null}

      <div className="fxl-buy-grid">
        {ACCOUNT_SIZES.map((s) => (
          <button
            key={s}
            type="button"
            className="fxl-buy-card"
            style={{
              borderColor:
                size === s ? "rgba(61,255,168,0.55)" : undefined,
              cursor: "pointer",
              textAlign: "left",
            }}
            onClick={() => setSize(s)}
          >
            <span className="fxl-muted">{formatAccountSize(s)}</span>
            <strong>{formatUsd(getChallengePrice(program, s))}</strong>
          </button>
        ))}
      </div>

      <div style={{ marginTop: "1.25rem" }}>
        <p>
          Selected: <strong>{PROGRAMS.find((p) => p.id === program)?.name}</strong>{" "}
          · {formatAccountSize(size)} · <strong className="price">{formatUsd(price)}</strong>
        </p>
      </div>

      <div className="fxl-tabs">
        <button
          type="button"
          className={`fxl-tab${method === "card" ? " active" : ""}`}
          onClick={() => setMethod("card")}
        >
          Card
        </button>
        <button
          type="button"
          className={`fxl-tab${method === "crypto" ? " active" : ""}`}
          onClick={() => {
            setMethod("crypto");
            void loadDeposits();
          }}
        >
          Crypto USDT
        </button>
      </div>

      {method === "crypto" ? (
        <label style={{ display: "grid", gap: "0.35rem", marginBottom: "0.75rem" }}>
          <span className="fxl-muted">Network</span>
          <select
            value={network}
            onChange={(e) =>
              setNetwork(e.target.value as "solana" | "bsc" | "tron")
            }
          >
            <option value="tron">TRON (TRC-20)</option>
            <option value="bsc">BNB Smart Chain (BEP-20)</option>
            <option value="solana">Solana</option>
          </select>
        </label>
      ) : null}

      {error ? <p className="fxl-error">{error}</p> : null}

      <div className="fxl-cta-row">
        <button
          type="button"
          className="fxl-btn"
          disabled={busy}
          onClick={() => (method === "card" ? payCard() : payCrypto())}
        >
          {busy
            ? "Working…"
            : method === "card"
              ? `Pay ${formatUsd(price)} with card`
              : `Get ${network.toUpperCase()} deposit address`}
        </button>
      </div>

      {cryptoResult ? (
        <div className="fxl-panel" style={{ marginTop: "1rem" }}>
          <h2>Send {formatUsd(cryptoResult.amountUsd)} in {cryptoResult.asset}</h2>
          <p className="fxl-muted">
            Network: {cryptoResult.network.toUpperCase()} · Invoice{" "}
            {cryptoResult.invoiceId}
          </p>
          <p className="fxl-mono">{cryptoResult.address}</p>
          <p className="fxl-muted" style={{ marginTop: "0.75rem" }}>
            After sending, open your dashboard. Ops confirms the transfer and activates
            the account. Keep the invoice id for support.
          </p>
        </div>
      ) : null}
    </div>
  );
}
