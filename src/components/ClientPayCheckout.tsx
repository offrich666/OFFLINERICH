"use client";

import { useEffect, useRef, useState } from "react";
import { loadStripeOnramp } from "@stripe/crypto";
import {
  MAX_AMOUNT_USD,
  MIN_AMOUNT_USD,
  ONRAMP_CLIENT_NETWORKS,
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
const QUICK_AMOUNTS = [5, 10, 25, 50, 100, 250, 500, 1000] as const;

type Mode = "pick" | "onramp";

/**
 * Stripe Crypto Onramp — embedded on this page (no hosted Link redirect).
 * Buyer copy stays brand-only; crypto settles directly to the client wallet.
 */
export function ClientPayCheckout() {
  const rangeLabel = checkoutAmountRangeLabel();
  const [amountInput, setAmountInput] = useState(String(MIN_AMOUNT_USD));
  const [email, setEmail] = useState("");
  const [network, setNetwork] = useState<OnrampClientNetworkId>("ethereum");
  const [wallet, setWallet] = useState("");
  const [mode, setMode] = useState<Mode>("pick");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paidAmount, setPaidAmount] = useState<number | null>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const secretRef = useRef<string | null>(null);
  const mountedOnceRef = useRef(false);

  const amountUsd = parseAmountUsd(amountInput);
  const amountOk = amountUsd != null && isValidAmountUsd(amountUsd);
  const amountLabel = amountOk ? formatUsd(amountUsd!) : rangeLabel;
  const normalizedWallet = normalizeWalletAddress(network, wallet);
  const walletOk = isValidWalletAddress(network, wallet);
  const walletDirty = wallet.trim().length > 0;
  const emailOk =
    !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canStart = amountOk && walletOk && emailOk && Boolean(publishableKey);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "onramp-active",
      mode === "onramp",
    );
    return () => document.documentElement.classList.remove("onramp-active");
  }, [mode]);

  useEffect(() => {
    if (mode !== "onramp" || !secretRef.current || !publishableKey) return;
    if (mountedOnceRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        if (mountRef.current) mountRef.current.innerHTML = "";
        const stripeOnramp = await loadStripeOnramp(publishableKey);
        if (!stripeOnramp || cancelled) {
          throw new Error("Could not load payment form");
        }
        const session = stripeOnramp.createSession({
          clientSecret: secretRef.current!,
          appearance: { theme: "dark" },
        });
        session.addEventListener("onramp_session_updated", (e) => {
          const next = e.payload?.session?.status as string | undefined;
          if (next === "fulfillment_complete") {
            setStatus("Paid — crypto is on the way to your wallet.");
          } else if (next === "fulfillment_processing") {
            setStatus("Payment received — delivering crypto…");
          } else if (next === "requires_payment") {
            setStatus("Enter card details below to finish.");
          } else if (next) {
            setStatus(`Status: ${next}`);
          }
        });
        if (mountRef.current && !cancelled) {
          session.mount(mountRef.current);
          mountedOnceRef.current = true;
          setStatus("Complete payment below — you stay on this page.");
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not open checkout",
          );
          secretRef.current = null;
          mountedOnceRef.current = false;
          setMode("pick");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode]);

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
          : "Enter a valid wallet address (0x + 40 hex).",
      );
      return;
    }
    if (!emailOk) {
      setError("Enter a valid email.");
      return;
    }
    if (!publishableKey) {
      setError("Checkout is not configured yet.");
      return;
    }
    if (!isOnrampClientNetwork(network)) {
      setError("Choose Ethereum or Bitcoin.");
      return;
    }

    setLoading(true);
    try {
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
        throw new Error(data.error || "Could not start checkout");
      }

      // Never follow redirectUrl / hosted Link — embed only.
      secretRef.current = data.clientSecret;
      mountedOnceRef.current = false;
      setWallet(normalizedWallet);
      setPaidAmount(amountUsd);
      setMode("onramp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed to start");
    } finally {
      setLoading(false);
    }
  }

  function resetToPick() {
    secretRef.current = null;
    mountedOnceRef.current = false;
    if (mountRef.current) mountRef.current.innerHTML = "";
    setPaidAmount(null);
    setStatus("");
    setError(null);
    setMode("pick");
  }

  if (mode === "onramp" && paidAmount != null) {
    return (
      <div className="payment-stack onramp-focus">
        <div className="destination-summary">
          <p>
            Pay <strong>{formatUsd(paidAmount)}</strong> → crypto to{" "}
            <code className="break">{wallet.trim()}</code> on {network}
          </p>
          <button type="button" className="ghost-link" onClick={resetToPick}>
            Change details
          </button>
        </div>
        {status ? <p className="form-hint">{status}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        <div className="stripe-embed onramp-embed" ref={mountRef} />
      </div>
    );
  }

  return (
    <div className="payment-stack client-pay">
      <div className="setup-panel soft">
        <h2>Buy crypto</h2>
        <p>
          Pay with card on this page. Crypto goes directly to your wallet.
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
        {!publishableKey ? (
          <p className="form-error">Checkout is not configured yet.</p>
        ) : null}

        <button
          type="button"
          className="primary-cta"
          onClick={startPay}
          disabled={loading || !canStart}
        >
          {loading
            ? "Opening secure form…"
            : `Buy crypto ${amountOk ? amountLabel : rangeLabel}`}
        </button>
        <p className="form-hint">
          Card form opens below on this page. Crypto settles to your wallet.
        </p>
      </div>
    </div>
  );
}
