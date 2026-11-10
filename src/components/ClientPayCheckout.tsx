"use client";

import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { StripeInstantEmbed } from "@/components/StripeInstantEmbed";
import {
  ONRAMP_CLIENT_NETWORKS,
  MAX_AMOUNT_USD,
  MIN_AMOUNT_USD,
  checkoutAmountRangeLabel,
  formatUsd,
  isOnrampClientNetwork,
  isValidAmountUsd,
  isValidWalletAddress,
  normalizeWalletAddress,
  parseAmountUsd,
  type OnrampClientNetworkId,
} from "@/lib/networks";
import { getStripePublishableKey } from "@/lib/stripePublic";

const publishableKey = getStripePublishableKey();
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;
const QUICK_AMOUNTS = [5, 10, 25, 50, 100, 250, 500, 1000] as const;

type PayPath = "instant" | "card";
type Mode = "pick" | "instant" | "card";

/**
 * Instant = live Stripe Crypto Onramp embed (card → crypto to wallet on-page).
 * Card = Stripe Embedded Checkout backup (crypto sent after payment).
 */
export function ClientPayCheckout() {
  const rangeLabel = checkoutAmountRangeLabel();
  const [path, setPath] = useState<PayPath>(
    publishableKey ? "instant" : "card",
  );
  const [amountInput, setAmountInput] = useState(String(MIN_AMOUNT_USD));
  const [email, setEmail] = useState("");
  const [network, setNetwork] = useState<OnrampClientNetworkId>("ethereum");
  const [wallet, setWallet] = useState("");
  const [mode, setMode] = useState<Mode>("pick");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paidAmount, setPaidAmount] = useState<number | null>(null);
  const [instantSecret, setInstantSecret] = useState<string | null>(null);
  const [cardSecret, setCardSecret] = useState<string | null>(null);
  const [instantReady, setInstantReady] = useState(Boolean(publishableKey));

  const amountUsd = parseAmountUsd(amountInput);
  const amountOk = amountUsd != null && isValidAmountUsd(amountUsd);
  const amountLabel = amountOk ? formatUsd(amountUsd!) : rangeLabel;
  const normalizedWallet = normalizeWalletAddress(network, wallet);
  const walletOk = isValidWalletAddress(network, wallet);
  const walletDirty = wallet.trim().length > 0;
  const emailOk =
    !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canStart =
    amountOk &&
    walletOk &&
    emailOk &&
    (path === "instant" ? instantReady : Boolean(publishableKey));

  useEffect(() => {
    let cancelled = false;
    fetch("/api/onramp/status")
      .then((r) => r.json())
      .then((data: { readyForOnrampUi?: boolean }) => {
        if (cancelled) return;
        const ready = Boolean(data.readyForOnrampUi && publishableKey);
        setInstantReady(ready);
        if (!ready) setPath("card");
      })
      .catch(() => {
        if (!cancelled) {
          setInstantReady(Boolean(publishableKey));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "onramp-active",
      mode === "instant" || mode === "card",
    );
    return () => document.documentElement.classList.remove("onramp-active");
  }, [mode]);

  async function startInstant() {
    if (!instantReady) {
      throw new Error("Instant is not configured yet.");
    }
    if (!isOnrampClientNetwork(network)) {
      throw new Error("Choose Ethereum or Bitcoin for Instant.");
    }
    const res = await fetch("/api/onramp/session", {
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
      throw new Error(data.error || "Could not start Instant checkout");
    }
    setInstantSecret(data.clientSecret);
    setWallet(normalizedWallet);
    setPaidAmount(amountUsd!);
    setMode("instant");
    setStatus(
      "Card checkout stays on this page — crypto goes to your wallet.",
    );
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
      "Card backup: pay here — crypto is sent after payment (not Instant).",
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
          ? "Enter a valid Bitcoin address."
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
    setInstantSecret(null);
    setCardSecret(null);
    setPaidAmount(null);
    setStatus("");
    setError(null);
    setMode("pick");
  }

  if (mode === "instant" && paidAmount != null && instantSecret) {
    return (
      <div className="payment-stack onramp-focus">
        <div className="destination-summary">
          <p>
            Instant <strong>{formatUsd(paidAmount)}</strong> → crypto to{" "}
            <code className="break">{wallet.trim()}</code> on {network}
          </p>
          <button type="button" className="ghost-link" onClick={resetToPick}>
            Change details
          </button>
        </div>
        {status ? <p className="form-hint">{status}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        <StripeInstantEmbed
          clientSecret={instantSecret}
          onPaid={() =>
            setStatus(
              "Paid — crypto is settling to your wallet. Keep this page open a moment.",
            )
          }
          onFailed={(message) => setError(message)}
        />
      </div>
    );
  }

  if (mode === "card" && paidAmount != null && cardSecret && stripePromise) {
    return (
      <div className="payment-stack onramp-focus">
        <div className="destination-summary">
          <p>
            Card backup <strong>{formatUsd(paidAmount)}</strong> → crypto later
            to <code className="break">{wallet.trim()}</code> on {network}
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
          Instant: pay with card on this page — crypto goes to your wallet. No
          off-site hop. Card backup is slower.
        </p>

        <div
          className="amount-chips path-chips"
          role="group"
          aria-label="Pay method"
        >
          <button
            type="button"
            className={path === "instant" ? "amount-chip active" : "amount-chip"}
            onClick={() => setPath("instant")}
            disabled={!instantReady}
          >
            Instant
          </button>
          <button
            type="button"
            className={path === "card" ? "amount-chip active" : "amount-chip"}
            onClick={() => setPath("card")}
          >
            Card backup
          </button>
        </div>

        {!instantReady ? (
          <p className="form-hint">
            Instant is finishing setup — use Card backup for now.
          </p>
        ) : null}

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
            onChange={(e) =>
              setNetwork(e.target.value as OnrampClientNetworkId)
            }
          >
            {ONRAMP_CLIENT_NETWORKS.map((n) => (
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
            placeholder={network === "bitcoin" ? "bc1…" : "0x…"}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {walletDirty && !walletOk ? (
          <p className="form-error">
            {network === "bitcoin"
              ? "Enter a valid Bitcoin address."
              : "Enter a valid wallet (0x + 40 hex)."}
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

        <button
          type="button"
          className="primary-cta"
          onClick={startPay}
          disabled={loading || !canStart}
        >
          {loading
            ? "Opening…"
            : path === "card"
              ? `Card backup ${amountOk ? amountLabel : rangeLabel}`
              : `Buy crypto ${amountOk ? amountLabel : rangeLabel}`}
        </button>
        <p className="form-hint">
          {path === "card"
            ? "Card backup pays on this page; crypto is sent later."
            : "You stay on this page. Crypto goes to your wallet when payment completes."}
        </p>
      </div>
    </div>
  );
}
