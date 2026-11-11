"use client";

import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { PaybisInstantEmbed } from "@/components/PaybisInstantEmbed";
import { ThirdwebInstantEmbed } from "@/components/ThirdwebInstantEmbed";
import {
  MAX_AMOUNT_USD,
  MIN_AMOUNT_USD,
  checkoutAmountRangeLabel,
  formatUsd,
  isValidAmountUsd,
  isValidWalletAddress,
  normalizeWalletAddress,
  parseAmountUsd,
} from "@/lib/networks";
import {
  THIRDWEB_INSTANT_NETWORKS,
  getThirdwebClientId,
  isThirdwebInstantNetwork,
  type ThirdwebInstantNetworkId,
} from "@/lib/thirdwebPublic";
import { getStripePublishableKey } from "@/lib/stripePublic";

const publishableKey = getStripePublishableKey();
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;
const thirdwebReady = Boolean(getThirdwebClientId());
const QUICK_AMOUNTS = [5, 10, 25, 50, 100, 250, 500, 1000] as const;

type PayPath = "instant" | "paybis" | "card";
type Mode = "pick" | "instant" | "paybis" | "card";

/**
 * Instant = current live thirdweb buy-widget (unchanged).
 * Paybis = separate on-page Paybis embed when partner keys are set.
 * Card = Stripe Embedded Checkout backup.
 */
export function ClientPayCheckout() {
  const rangeLabel = checkoutAmountRangeLabel();
  const [paybisReady, setPaybisReady] = useState(false);
  const [path, setPath] = useState<PayPath>(
    thirdwebReady ? "instant" : "card",
  );
  const [amountInput, setAmountInput] = useState(String(MIN_AMOUNT_USD));
  const [email, setEmail] = useState("");
  const [network, setNetwork] = useState<ThirdwebInstantNetworkId>("ethereum");
  const [wallet, setWallet] = useState("");
  const [mode, setMode] = useState<Mode>("pick");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paidAmount, setPaidAmount] = useState<number | null>(null);
  const [cardSecret, setCardSecret] = useState<string | null>(null);

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
    (path === "instant"
      ? thirdwebReady
      : path === "paybis"
        ? paybisReady
        : Boolean(publishableKey));

  useEffect(() => {
    let cancelled = false;
    fetch("/api/onramp/paybis/session")
      .then((r) => r.json())
      .then((data: { ready?: boolean }) => {
        if (!cancelled) setPaybisReady(Boolean(data.ready));
      })
      .catch(() => {
        if (!cancelled) setPaybisReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "onramp-active",
      mode === "instant" || mode === "paybis" || mode === "card",
    );
    return () => document.documentElement.classList.remove("onramp-active");
  }, [mode]);

  function startInstant() {
    if (!thirdwebReady) throw new Error("Instant is not configured yet.");
    if (!isThirdwebInstantNetwork(network)) {
      throw new Error("Choose Ethereum, Polygon, Base, or BNB Chain.");
    }
    setWallet(normalizedWallet);
    setPaidAmount(amountUsd!);
    setMode("instant");
    setStatus("");
  }

  function startPaybis() {
    if (!paybisReady) {
      throw new Error(
        "Paybis is not live yet. Add Partner ID + HMAC from the Paybis dashboard (richoffline666@gmail.com) and whitelist www.walletchainsign.com.",
      );
    }
    if (!isThirdwebInstantNetwork(network)) {
      throw new Error("Choose Ethereum, Polygon, Base, or BNB Chain.");
    }
    setWallet(normalizedWallet);
    setPaidAmount(amountUsd!);
    setMode("paybis");
    setStatus("");
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
      setError("Enter a valid wallet address (0x + 40 hex).");
      return;
    }
    if (!emailOk) {
      setError("Enter a valid email.");
      return;
    }

    setLoading(true);
    try {
      if (path === "card") await startCard();
      else if (path === "paybis") startPaybis();
      else startInstant();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed to start");
      setMode("pick");
    } finally {
      setLoading(false);
    }
  }

  function resetToPick() {
    setCardSecret(null);
    setPaidAmount(null);
    setStatus("");
    setError(null);
    setMode("pick");
  }

  if (mode === "instant" && paidAmount != null) {
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
        <ThirdwebInstantEmbed
          amountUsd={paidAmount}
          network={network}
          walletAddress={normalizedWallet || wallet.trim()}
          onPaid={() => setStatus("Paid — crypto is settling to your wallet.")}
          onFailed={(message) => setError(message)}
        />
      </div>
    );
  }

  if (mode === "paybis" && paidAmount != null) {
    return (
      <div className="payment-stack onramp-focus">
        <div className="destination-summary">
          <p>
            Paybis <strong>{formatUsd(paidAmount)}</strong> → crypto to{" "}
            <code className="break">{wallet.trim()}</code> on {network}
          </p>
          <button type="button" className="ghost-link" onClick={resetToPick}>
            Change details
          </button>
        </div>
        {status ? <p className="form-hint">{status}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        <PaybisInstantEmbed
          amountUsd={paidAmount}
          network={network}
          walletAddress={normalizedWallet || wallet.trim()}
          email={email.trim() || undefined}
          onPaid={() => setStatus("Paid — crypto is settling to your wallet.")}
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
          Pick a method. Instant stays as it is. Paybis is a separate on-page
          card checkout when enabled.
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
            disabled={!thirdwebReady}
          >
            Instant
          </button>
          <button
            type="button"
            className={path === "paybis" ? "amount-chip active" : "amount-chip"}
            onClick={() => setPath("paybis")}
          >
            Paybis
          </button>
          <button
            type="button"
            className={path === "card" ? "amount-chip active" : "amount-chip"}
            onClick={() => setPath("card")}
          >
            Card backup
          </button>
        </div>

        {path === "paybis" && !paybisReady ? (
          <p className="form-hint">
            Paybis needs Partner ID + HMAC from the Paybis dashboard
            (richoffline666@gmail.com), plus whitelist www.walletchainsign.com.
            Use Instant until those are added.
          </p>
        ) : null}

        {!thirdwebReady ? (
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
            inputMode="decimal"
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
              setNetwork(e.target.value as ThirdwebInstantNetworkId)
            }
          >
            {THIRDWEB_INSTANT_NETWORKS.map((n) => (
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
            placeholder="0x…"
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </label>
        {walletDirty && !walletOk ? (
          <p className="form-error">Enter a valid wallet (0x + 40 hex).</p>
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
              : path === "paybis"
                ? `Paybis ${amountOk ? amountLabel : rangeLabel}`
                : `Buy crypto ${amountOk ? amountLabel : rangeLabel}`}
        </button>
        <p className="form-hint">
          {path === "card"
            ? "Card backup pays on this page; crypto is sent later."
            : path === "paybis"
              ? "Paybis stays on this page. Card → crypto to your wallet."
              : "Instant stays on this page. Crypto goes to your wallet when payment completes."}
        </p>
      </div>
    </div>
  );
}
