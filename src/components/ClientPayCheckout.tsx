"use client";

import { useCallback, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import {
  MAX_AMOUNT_USD,
  MIN_AMOUNT_USD,
  checkoutAmountRangeLabel,
  formatUsd,
  isValidAmountUsd,
  parseAmountUsd,
} from "@/lib/networks";
import { getStripePublishableKey } from "@/lib/stripePublic";

const publishableKey = getStripePublishableKey();
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

const QUICK_AMOUNTS = [5, 10, 25, 50, 100, 250, 500, 1000] as const;

/**
 * Payment-Link-simple UX: pick an amount → pay with card / Apple Pay / Google Pay
 * on this page. No network picker, no wallet field, no Onramp KYC form.
 * Ops delivers crypto after Stripe marks the payment paid (email on the charge).
 */
export function ClientPayCheckout() {
  const rangeLabel = checkoutAmountRangeLabel();
  const [amountInput, setAmountInput] = useState(String(MIN_AMOUNT_USD));
  const [mode, setMode] = useState<"pick" | "pay">("pick");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paidAmount, setPaidAmount] = useState<number | null>(null);

  const amountUsd = parseAmountUsd(amountInput);
  const amountOk = amountUsd != null && isValidAmountUsd(amountUsd);
  const amountLabel = amountOk ? formatUsd(amountUsd!) : rangeLabel;

  const fetchClientSecret = useCallback(async () => {
    const res = await fetch("/api/checkout/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountUsd: paidAmount ?? amountUsd }),
    });
    const data = (await res.json()) as { clientSecret?: string; error?: string };
    if (!res.ok || !data.clientSecret) {
      throw new Error(data.error || "Could not start checkout");
    }
    return data.clientSecret;
  }, [paidAmount, amountUsd]);

  async function startPay() {
    setError(null);
    if (!amountOk || amountUsd == null) {
      setError(
        `Enter an amount from ${formatUsd(MIN_AMOUNT_USD)} to ${formatUsd(MAX_AMOUNT_USD)}.`,
      );
      return;
    }
    if (!publishableKey || !stripePromise) {
      setError("Stripe publishable key missing.");
      return;
    }
    setLoading(true);
    setPaidAmount(amountUsd);
    setMode("pay");
    setLoading(false);
  }

  if (mode === "pay" && paidAmount != null && stripePromise) {
    return (
      <div className="payment-stack client-pay">
        <div className="destination-summary">
          <p>
            Pay <strong>{formatUsd(paidAmount)}</strong> with card, Apple Pay, or
            Google Pay
          </p>
          <button
            type="button"
            className="ghost-link"
            onClick={() => {
              setMode("pick");
              setPaidAmount(null);
              setError(null);
            }}
          >
            Change amount
          </button>
        </div>
        <div className="stripe-embed">
          <EmbeddedCheckoutProvider
            key={paidAmount}
            stripe={stripePromise}
            options={{ fetchClientSecret }}
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
        <h2>Pay</h2>
        <p>Pick an amount. Pay on this page — no wallet or network needed.</p>

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

        {error ? <p className="form-error">{error}</p> : null}

        <button
          type="button"
          className="primary-cta"
          onClick={startPay}
          disabled={loading || !amountOk}
        >
          {loading ? "Starting…" : `Continue to pay ${amountOk ? amountLabel : rangeLabel}`}
        </button>

        <p className="fineprint">
          After payment we email you and send crypto to the wallet you provide.
        </p>
      </div>
    </div>
  );
}
