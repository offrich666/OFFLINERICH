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

/**
 * Easy Onramp: amount (+ email) → Stripe Crypto Onramp widget.
 * Crypto settles to OFFLINERICH treasury (locked). No network/wallet picker.
 * Stripe still collects required identity inside the widget (lowest KYC for the amount).
 */
export function ClientPayCheckout() {
  const rangeLabel = checkoutAmountRangeLabel();
  const [amountInput, setAmountInput] = useState(String(MIN_AMOUNT_USD));
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<"pick" | "onramp">("pick");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paidAmount, setPaidAmount] = useState<number | null>(null);
  const onrampMountRef = useRef<HTMLDivElement>(null);
  const clientSecretRef = useRef<string | null>(null);

  const amountUsd = parseAmountUsd(amountInput);
  const amountOk = amountUsd != null && isValidAmountUsd(amountUsd);
  const amountLabel = amountOk ? formatUsd(amountUsd!) : rangeLabel;

  useEffect(() => {
    document.documentElement.classList.toggle("onramp-active", mode === "onramp");
    return () => document.documentElement.classList.remove("onramp-active");
  }, [mode]);

  useEffect(() => {
    if (mode !== "onramp" || !clientSecretRef.current || !publishableKey) return;
    let cancelled = false;
    (async () => {
      try {
        if (onrampMountRef.current) onrampMountRef.current.innerHTML = "";
        const stripeOnramp = await loadStripeOnramp(publishableKey);
        if (!stripeOnramp || cancelled) throw new Error("Failed to load pay form");
        const session = stripeOnramp.createSession({
          clientSecret: clientSecretRef.current!,
          appearance: { theme: "dark" },
        });
        session.addEventListener("onramp_session_updated", (e) => {
          const next = e.payload?.session?.status as string | undefined;
          if (next === "fulfillment_complete") {
            setStatus(
              "Paid — USDC is in the OFFLINERICH treasury. Reply with your wallet for delivery.",
            );
          } else if (next === "fulfillment_processing") {
            setStatus("Payment received — crypto settling to treasury…");
          } else if (next === "initialized" || next === "requires_payment") {
            setStatus(
              "Complete the short Stripe steps below (card / Apple Pay / Google Pay).",
            );
          } else if (next) {
            setStatus(`Status: ${next}`);
          }
        });
        if (onrampMountRef.current && !cancelled) {
          session.mount(onrampMountRef.current);
          setStatus(
            "Complete the short Stripe steps below (card / Apple Pay / Google Pay).",
          );
          requestAnimationFrame(() => {
            onrampMountRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not open payment");
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
    setStatus("");
    if (!amountOk || amountUsd == null) {
      setError(
        `Enter an amount from ${formatUsd(MIN_AMOUNT_USD)} to ${formatUsd(MAX_AMOUNT_USD)}.`,
      );
      return;
    }
    if (!publishableKey) {
      setError("Stripe publishable key missing.");
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
      const data = (await res.json()) as {
        clientSecret?: string;
        error?: string;
      };
      if (!res.ok || !data.clientSecret) {
        throw new Error(data.error || "Could not start crypto checkout");
      }
      clientSecretRef.current = data.clientSecret;
      setPaidAmount(amountUsd);
      setMode("onramp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed to start");
    } finally {
      setLoading(false);
    }
  }

  if (mode === "onramp" && paidAmount != null) {
    return (
      <div className="payment-stack onramp-focus">
        <div className="destination-summary">
          <p>
            Pay <strong>{formatUsd(paidAmount)}</strong> → USDC to OFFLINERICH
            treasury
          </p>
          <button
            type="button"
            className="ghost-link"
            onClick={() => {
              clientSecretRef.current = null;
              setMode("pick");
              setPaidAmount(null);
              setStatus("");
            }}
          >
            Change amount
          </button>
        </div>
        {status ? <p className="form-hint">{status}</p> : null}
        <div ref={onrampMountRef} className="stripe-embed onramp-mount" />
        <p className="fineprint">
          Stripe requires a short identity check for crypto purchases (name /
          email / address; higher amounts may ask for more). Cards, Apple Pay,
          and Google Pay are accepted where Stripe Onramp is available (US +
          EU).
        </p>
      </div>
    );
  }

  return (
    <div className="payment-stack client-pay">
      <div className="setup-panel soft">
        <h2>Pay</h2>
        <p>
          Pick an amount. Crypto goes to the OFFLINERICH treasury when you pay —
          then we deliver to your wallet.
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
          Email (optional — speeds checkout + delivery)
          <input
            type="email"
            autoComplete="email"
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
            : `Continue to pay ${amountOk ? amountLabel : rangeLabel}`}
        </button>

        <p className="fineprint">
          No wallet or network to enter here. After pay, send us the delivery
          wallet.
        </p>
      </div>
    </div>
  );
}
