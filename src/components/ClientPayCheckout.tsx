"use client";

import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
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
import { getStripePublishableKey } from "@/lib/stripePublic";

const publishableKey = getStripePublishableKey();
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;
const QUICK_AMOUNTS = [5, 10, 25, 50, 100, 250, 500, 1000] as const;

type PayPath = "instant" | "card";
type Mode = "pick" | "instant" | "card";

/**
 * Instant = Ramp Network (crypto to your wallet after card pay).
 * Card = Stripe Checkout backup (ops send after paid).
 */
export function ClientPayCheckout() {
  const rangeLabel = checkoutAmountRangeLabel();
  const [path, setPath] = useState<PayPath>("instant");
  const [amountInput, setAmountInput] = useState(String(MIN_AMOUNT_USD));
  const [email, setEmail] = useState("");
  const [network, setNetwork] = useState<ClientNetworkId>("ethereum");
  const [wallet, setWallet] = useState("");
  const [mode, setMode] = useState<Mode>("pick");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paidAmount, setPaidAmount] = useState<number | null>(null);
  const [cardSecret, setCardSecret] = useState<string | null>(null);
  const [instantUrl, setInstantUrl] = useState<string | null>(null);

  const amountUsd = parseAmountUsd(amountInput);
  const amountOk = amountUsd != null && isValidAmountUsd(amountUsd);
  const amountLabel = amountOk ? formatUsd(amountUsd!) : rangeLabel;
  const normalizedWallet = normalizeWalletAddress(network, wallet);
  const walletOk = isValidWalletAddress(network, wallet);
  const walletDirty = wallet.trim().length > 0;
  const emailOk =
    !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canStart = amountOk && walletOk && emailOk;

  useEffect(() => {
    document.documentElement.classList.toggle(
      "onramp-active",
      mode === "instant" || mode === "card",
    );
    return () => document.documentElement.classList.remove("onramp-active");
  }, [mode]);

  async function startInstant() {
    const res = await fetch("/api/onramp/instant/session", {
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
      note?: string;
    };
    if (!res.ok || !data.url) {
      throw new Error(data.error || "Could not start Instant crypto");
    }
    setWallet(normalizedWallet);
    setPaidAmount(amountUsd!);
    setInstantUrl(data.url);
    setMode("instant");
    setStatus(
      data.note ||
        "Opening secure Instant checkout — crypto goes to your wallet.",
    );
    window.location.assign(data.url);
  }

  async function startCard() {
    if (!publishableKey || !stripePromise) {
      throw new Error("Card checkout is not configured.");
    }
    const res = await fetch("/api/checkout/session", {
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
      clientSecret?: string;
      error?: string;
    };
    if (!res.ok || !data.clientSecret) {
      throw new Error(data.error || "Could not start card checkout");
    }
    setCardSecret(data.clientSecret);
    setPaidAmount(amountUsd!);
    setWallet(normalizedWallet);
    setMode("card");
    setStatus(
      "Card pay clears here — crypto is sent to your wallet after payment.",
    );
  }

  async function startPay() {
    setError(null);
    if (!amountOk || amountUsd == null) {
      setError(
        `Enter an amount from ${formatUsd(MIN_AMOUNT_USD)} to ${formatUsd(MAX_AMOUNT_USD)}.`,
      );
      return;
    }
    if (!walletOk) {
      setError(
        network === "bitcoin"
          ? "Enter a valid Bitcoin address (bc1… / 1… / 3…)."
          : network === "solana"
            ? "Enter a valid Solana wallet."
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
      if (path === "card") await startCard();
      else await startInstant();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed to start");
      setMode("pick");
    } finally {
      setLoading(false);
    }
  }

  function resetToPick() {
    setInstantUrl(null);
    setCardSecret(null);
    setPaidAmount(null);
    setStatus("");
    setError(null);
    setMode("pick");
  }

  if (mode === "instant" && paidAmount != null) {
    return (
      <div className="payment-stack client-pay">
        <div className="setup-panel soft">
          <h2>Opening Instant checkout…</h2>
          <p>
            Pay with card. Crypto goes to{" "}
            <code className="break">{wallet.trim()}</code> on {network}.
          </p>
          {instantUrl ? (
            <p className="form-hint">
              If nothing opens,{" "}
              <a href={instantUrl} rel="noreferrer">
                continue Instant pay
              </a>
              .
            </p>
          ) : null}
          <button type="button" className="ghost-link" onClick={resetToPick}>
            Back
          </button>
        </div>
      </div>
    );
  }

  if (mode === "card" && paidAmount != null && cardSecret && stripePromise) {
    return (
      <div className="payment-stack onramp-focus">
        <div className="destination-summary">
          <p>
            Card pay <strong>{formatUsd(paidAmount)}</strong> → crypto to{" "}
            <code className="break">{wallet.trim()}</code> on {network}
          </p>
          <button type="button" className="ghost-link" onClick={resetToPick}>
            Change details
          </button>
        </div>
        {status ? <p className="form-hint">{status}</p> : null}
        <div className="stripe-embed">
          <EmbeddedCheckoutProvider
            stripe={stripePromise}
            options={{ clientSecret: cardSecret }}
          >
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      </div>
    );
  }

  return (
    <div className="payment-stack client-pay">
      <div className="setup-panel soft">
        <h2>Buy crypto</h2>
        <p>
          Instant pays with card and sends crypto straight to your wallet. Card
          is a backup if you need it.
        </p>

        <div className="amount-chips path-chips" role="group" aria-label="Pay method">
          <button
            type="button"
            className={path === "instant" ? "amount-chip active" : "amount-chip"}
            onClick={() => setPath("instant")}
          >
            Instant
          </button>
          <button
            type="button"
            className={path === "card" ? "amount-chip active" : "amount-chip"}
            onClick={() => setPath("card")}
          >
            Card
          </button>
        </div>

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
              network === "bitcoin"
                ? "bc1…"
                : network === "solana"
                  ? "Solana address"
                  : "0x…"
            }
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {walletDirty && !walletOk ? (
          <p className="form-error">Enter a valid wallet for this network.</p>
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

        <button
          type="button"
          className="primary-cta"
          onClick={startPay}
          disabled={loading || !canStart}
        >
          {loading
            ? "Opening secure form…"
            : path === "card"
              ? `Pay with card ${amountOk ? amountLabel : rangeLabel}`
              : `Buy crypto ${amountOk ? amountLabel : rangeLabel}`}
        </button>
        <p className="form-hint">
          {path === "card"
            ? "Card clears on this page; crypto is sent to your wallet after payment."
            : "Instant delivers crypto to your wallet when payment completes."}
        </p>
      </div>
    </div>
  );
}
