"use client";

import { useEffect, useRef, useState } from "react";
import { loadStripeOnramp } from "@stripe/crypto";
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
const QUICK_AMOUNTS = [5, 10, 25, 50, 100, 250, 500, 1000] as const;

/** Optional Stripe Crypto Onramp → locked treasury USDC. */
export function StripeTreasuryOnramp() {
  const rangeLabel = checkoutAmountRangeLabel();
  const [amountInput, setAmountInput] = useState(String(MIN_AMOUNT_USD));
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<"pick" | "onramp">("pick");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paidAmount, setPaidAmount] = useState<number | null>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const secretRef = useRef<string | null>(null);

  const amountUsd = parseAmountUsd(amountInput);
  const amountOk = amountUsd != null && isValidAmountUsd(amountUsd);

  useEffect(() => {
    document.documentElement.classList.toggle("onramp-active", mode === "onramp");
    return () => document.documentElement.classList.remove("onramp-active");
  }, [mode]);

  useEffect(() => {
    if (mode !== "onramp" || !secretRef.current || !publishableKey) return;
    let cancelled = false;
    (async () => {
      try {
        if (mountRef.current) mountRef.current.innerHTML = "";
        const stripeOnramp = await loadStripeOnramp(publishableKey);
        if (!stripeOnramp || cancelled) throw new Error("Failed to load onramp");
        const session = stripeOnramp.createSession({
          clientSecret: secretRef.current!,
          appearance: { theme: "dark" },
        });
        session.addEventListener("onramp_session_updated", (e) => {
          const next = e.payload?.session?.status as string | undefined;
          if (next === "fulfillment_complete") {
            setStatus("Paid — USDC is in the OFFLINERICH treasury.");
          } else if (next === "fulfillment_processing") {
            setStatus("Payment received — settling to treasury…");
          } else if (next) {
            setStatus(`Status: ${next}`);
          }
        });
        if (mountRef.current && !cancelled) {
          session.mount(mountRef.current);
          setStatus("Complete Stripe steps below.");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not open onramp");
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
    setLoading(true);
    try {
      const res = await fetch("/api/onramp/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountUsd,
          email: email.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { clientSecret?: string; error?: string };
      if (!res.ok || !data.clientSecret) {
        throw new Error(data.error || "Could not start onramp");
      }
      secretRef.current = data.clientSecret;
      setPaidAmount(amountUsd);
      setMode("onramp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
    } finally {
      setLoading(false);
    }
  }

  if (mode === "onramp" && paidAmount != null) {
    return (
      <div className="payment-stack onramp-focus">
        <div className="destination-summary">
          <p>
            Pay <strong>{formatUsd(paidAmount)}</strong> → USDC treasury
          </p>
          <button
            type="button"
            className="ghost-link"
            onClick={() => {
              secretRef.current = null;
              setMode("pick");
              setPaidAmount(null);
            }}
          >
            Change amount
          </button>
        </div>
        {status ? <p className="form-hint">{status}</p> : null}
        <div ref={mountRef} className="stripe-embed onramp-mount" />
      </div>
    );
  }

  return (
    <div className="payment-stack client-pay">
      <div className="setup-panel soft">
        <h2>Crypto Onramp</h2>
        <p>USDC settles to treasury when the card allows crypto purchases.</p>
        <div className="amount-chips" role="group" aria-label="Quick amounts">
          {QUICK_AMOUNTS.map((n) => (
            <button
              key={n}
              type="button"
              className={amountOk && amountUsd === n ? "amount-chip active" : "amount-chip"}
              onClick={() => setAmountInput(String(n))}
            >
              {formatUsd(n)}
            </button>
          ))}
        </div>
        <label className="field">
          Amount (USD)
          <input
            type="number"
            min={MIN_AMOUNT_USD}
            max={MAX_AMOUNT_USD}
            step="1"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
          />
        </label>
        <label className="field">
          Email (optional)
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button
          type="button"
          className="primary-cta"
          onClick={startPay}
          disabled={loading || !amountOk}
        >
          {loading
            ? "Starting…"
            : `Continue ${amountOk ? formatUsd(amountUsd!) : rangeLabel}`}
        </button>
      </div>
    </div>
  );
}
