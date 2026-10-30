"use client";

import { useEffect, useRef, useState } from "react";
import { loadStripeOnramp } from "@stripe/crypto";
import {
  CLIENT_NETWORKS,
  MAX_AMOUNT_USD,
  MIN_AMOUNT_USD,
  checkoutAmountRangeLabel,
  formatUsd,
  isValidAmountUsd,
  isValidWalletAddress,
  parseAmountUsd,
  type ClientNetworkId,
} from "@/lib/networks";
import { getStripePublishableKey } from "@/lib/stripePublic";

const publishableKey = getStripePublishableKey();
const QUICK_AMOUNTS = [5, 10, 25, 50, 100, 250, 500, 1000] as const;

/**
 * Client flow (simple):
 * 1) Amount (+ optional email)
 * 2) Stripe Onramp (KYC + card) — crypto settles to OUR locked treasury (hidden)
 * 3) After pay: client enters THEIR delivery wallet only
 *
 * Client never sees the treasury address.
 */
export function ClientPayCheckout() {
  const rangeLabel = checkoutAmountRangeLabel();
  const [amountInput, setAmountInput] = useState(String(MIN_AMOUNT_USD));
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<"pick" | "onramp" | "delivery" | "done">(
    "pick",
  );
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paidAmount, setPaidAmount] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [network, setNetwork] = useState<ClientNetworkId>("ethereum");
  const [wallet, setWallet] = useState("");
  const mountRef = useRef<HTMLDivElement>(null);
  const secretRef = useRef<string | null>(null);

  const amountUsd = parseAmountUsd(amountInput);
  const amountOk = amountUsd != null && isValidAmountUsd(amountUsd);
  const amountLabel = amountOk ? formatUsd(amountUsd!) : rangeLabel;
  const walletOk = isValidWalletAddress(network, wallet);

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
        if (!stripeOnramp || cancelled) throw new Error("Failed to load pay form");
        const session = stripeOnramp.createSession({
          clientSecret: secretRef.current!,
          appearance: { theme: "dark" },
        });
        session.addEventListener("onramp_session_updated", (e) => {
          const next = e.payload?.session?.status as string | undefined;
          if (next === "fulfillment_complete") {
            setStatus("Payment complete. Where should we send your crypto?");
            setMode("delivery");
          } else if (next === "fulfillment_processing") {
            setStatus("Payment received — finishing…");
          } else if (next === "initialized" || next === "requires_payment") {
            setStatus("Complete the short Stripe steps below to pay.");
          } else if (next) {
            setStatus(`Status: ${next}`);
          }
        });
        if (mountRef.current && !cancelled) {
          session.mount(mountRef.current);
          setStatus("Complete the short Stripe steps below to pay.");
          requestAnimationFrame(() => {
            mountRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
        sessionId?: string;
        error?: string;
      };
      if (!res.ok || !data.clientSecret) {
        throw new Error(data.error || "Could not start checkout");
      }
      secretRef.current = data.clientSecret;
      setSessionId(data.sessionId || null);
      setPaidAmount(amountUsd);
      setMode("onramp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed to start");
    } finally {
      setLoading(false);
    }
  }

  async function saveDelivery() {
    setError(null);
    if (!sessionId) {
      setError("Payment session missing — refresh and try again.");
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
    setLoading(true);
    try {
      const res = await fetch("/api/onramp/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          network,
          wallet: wallet.trim(),
          email: email.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Could not save wallet");
      }
      setMode("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save wallet");
    } finally {
      setLoading(false);
    }
  }

  if (mode === "done") {
    return (
      <div className="payment-stack client-pay">
        <div className="setup-panel soft">
          <h2>You’re set</h2>
          <p>
            Payment received. We’ll send crypto to{" "}
            <code className="break">{wallet.trim()}</code> on {network}.
          </p>
        </div>
      </div>
    );
  }

  if (mode === "delivery") {
    return (
      <div className="payment-stack client-pay">
        <div className="setup-panel soft">
          <h2>Delivery wallet</h2>
          <p>
            Payment received
            {paidAmount ? ` (${formatUsd(paidAmount)})` : ""}. Enter the wallet
            where you want your crypto sent.
          </p>
          {status ? <p className="form-hint">{status}</p> : null}

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
              placeholder={network === "bitcoin" ? "bc1…" : "0x…"}
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <button
            type="button"
            className="primary-cta"
            onClick={saveDelivery}
            disabled={loading || !walletOk}
          >
            {loading ? "Saving…" : "Confirm delivery wallet"}
          </button>
        </div>
      </div>
    );
  }

  if (mode === "onramp" && paidAmount != null) {
    return (
      <div className="payment-stack onramp-focus">
        <div className="destination-summary">
          <p>
            Paying <strong>{formatUsd(paidAmount)}</strong>
          </p>
          <button
            type="button"
            className="ghost-link"
            onClick={() => {
              secretRef.current = null;
              setSessionId(null);
              setMode("pick");
              setPaidAmount(null);
              setStatus("");
            }}
          >
            Change amount
          </button>
        </div>
        {status ? <p className="form-hint">{status}</p> : null}
        <div ref={mountRef} className="stripe-embed onramp-mount" />
        <p className="fineprint">
          Stripe may ask for a short identity check (normal for buying crypto).
          After payment you’ll enter your own wallet for delivery.
        </p>
      </div>
    );
  }

  return (
    <div className="payment-stack client-pay">
      <div className="setup-panel soft">
        <h2>Pay</h2>
        <p>
          Pick an amount, pay with card / Apple Pay / Google Pay. After payment,
          tell us your wallet — we deliver the crypto there.
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
          Email (optional — speeds checkout)
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
      </div>
    </div>
  );
}
