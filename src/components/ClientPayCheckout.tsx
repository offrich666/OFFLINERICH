"use client";

import { useState } from "react";
import {
  CLIENT_NETWORKS,
  MAX_AMOUNT_USD,
  MIN_AMOUNT_USD,
  checkoutAmountRangeLabel,
  formatUsd,
  isValidAmountUsd,
  isValidWalletAddress,
  normalizeWalletAddress,
  parseAmountUsd,
  type ClientNetworkId,
} from "@/lib/networks";

const QUICK_AMOUNTS = [5, 10, 25, 50, 100, 250, 500, 1000] as const;

type Mode = "pick" | "redirecting";

/**
 * Instant crypto: Transak (card / Apple Pay / Google Pay) → USDC/BTC to wallet.
 * No Stripe. Crossmint production Onramp is Sales-locked; Transak staging works
 * as soon as API keys are added.
 */
export function ClientPayCheckout() {
  const rangeLabel = checkoutAmountRangeLabel();
  const [amountInput, setAmountInput] = useState(String(MIN_AMOUNT_USD));
  const [email, setEmail] = useState("");
  const [network, setNetwork] = useState<ClientNetworkId>("ethereum");
  const [wallet, setWallet] = useState("");
  const [mode, setMode] = useState<Mode>("pick");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signupUrl, setSignupUrl] = useState<string | null>(null);

  const amountUsd = parseAmountUsd(amountInput);
  const amountOk = amountUsd != null && isValidAmountUsd(amountUsd);
  const amountLabel = amountOk ? formatUsd(amountUsd!) : rangeLabel;
  const normalizedWallet = normalizeWalletAddress(network, wallet);
  const walletOk = isValidWalletAddress(network, wallet);
  const walletDirty = wallet.trim().length > 0;
  const emailOk =
    !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canStart = amountOk && walletOk && emailOk;

  async function startPay() {
    setError(null);
    setSignupUrl(null);
    if (!amountOk || amountUsd == null) {
      setError(
        `Enter an amount from ${formatUsd(MIN_AMOUNT_USD)} to ${formatUsd(MAX_AMOUNT_USD)}.`,
      );
      return;
    }
    if (!walletOk) {
      setError(
        network === "solana"
          ? "Enter a valid Solana wallet address."
          : network === "bitcoin"
            ? "Enter a valid Bitcoin address (bc1… / 1… / 3…)."
            : "Enter a valid wallet address (0x + 40 hex).",
      );
      return;
    }
    if (!emailOk) {
      setError("Enter a valid email.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/onramp/transak/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountUsd,
          email: email.trim() || undefined,
          network,
          wallet: normalizedWallet,
        }),
      });
      const data = (await res.json()) as {
        url?: string;
        error?: string;
        code?: string;
        signupUrl?: string;
      };
      if (!res.ok || !data.url) {
        if (data.signupUrl) setSignupUrl(data.signupUrl);
        throw new Error(data.error || "Could not start instant crypto");
      }
      setWallet(normalizedWallet);
      setMode("redirecting");
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed to start");
      setMode("pick");
    } finally {
      setLoading(false);
    }
  }

  if (mode === "redirecting") {
    return (
      <div className="payment-stack client-pay">
        <div className="setup-panel soft">
          <h2>Opening instant crypto…</h2>
          <p>Pay with card, Apple Pay, or Google Pay. Crypto goes to your wallet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="payment-stack client-pay">
      <div className="setup-panel soft">
        <h2>Buy crypto</h2>
        <p>
          Instant buy — card / Apple Pay / Google Pay. Crypto is sent to your
          wallet on-chain.
        </p>

        <div className="amount-chips" role="group" aria-label="Quick amounts">
          {QUICK_AMOUNTS.map((n) => {
            const active = amountOk && amountUsd === n;
            return (
              <button
                key={n}
                type="button"
                className={active ? "amount-chip active" : "amount-chip"}
                onClick={() => setAmountInput(String(n))}
              >
                {formatUsd(n)}
              </button>
            );
          })}
        </div>

        <label className="field">
          Or enter amount (USD)
          <input
            type="number"
            min={MIN_AMOUNT_USD}
            max={MAX_AMOUNT_USD}
            step="1"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder={`${MIN_AMOUNT_USD}`}
          />
        </label>

        <label className="field">
          Network
          <select
            value={network}
            onChange={(e) => setNetwork(e.target.value as ClientNetworkId)}
          >
            {CLIENT_NETWORKS.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label} ({n.asset})
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Your wallet
          <input
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            placeholder={
              network === "solana"
                ? "Solana address…"
                : network === "bitcoin"
                  ? "bc1…"
                  : "0x…"
            }
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {walletDirty && !walletOk ? (
          <p className="form-error">
            {network === "solana"
              ? "Enter a valid Solana wallet address."
              : network === "bitcoin"
                ? "Enter a valid Bitcoin address (bc1… / 1… / 3…)."
                : "Enter a valid wallet (0x + 40 hex characters)."}
          </p>
        ) : null}

        <label className="field">
          Email (optional)
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        {email.trim() && !emailOk ? (
          <p className="form-error">Enter a valid email.</p>
        ) : null}

        {error ? <p className="form-error">{error}</p> : null}
        {signupUrl ? (
          <p className="form-hint">
            Partner setup: open{" "}
            <a href={signupUrl} target="_blank" rel="noreferrer">
              {signupUrl}
            </a>
            , copy Staging API Key + Secret, add to env, redeploy.
          </p>
        ) : null}

        <button
          type="button"
          className="primary-cta"
          onClick={startPay}
          disabled={loading || !canStart}
        >
          {loading ? "Starting…" : `Buy crypto ${amountOk ? amountLabel : rangeLabel}`}
        </button>
        <p className="form-hint">
          You’ll finish on a secure buy page. Crypto lands in the wallet above.
        </p>
      </div>
    </div>
  );
}
