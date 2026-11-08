"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type Mode = "pick" | "card";

/**
 * On-page Stripe card form (no crypto.link.com, no new tab).
 * Money settles to your Stripe account → then send crypto to their wallet.
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
  const [paidAmount, setPaidAmount] = useState<number | null>(null);
  const [cardReady, setCardReady] = useState(false);
  const cardRequestRef = useRef<{
    amountUsd: number;
    email?: string;
    network: string;
    wallet: string;
  } | null>(null);
  const cardSecretPromiseRef = useRef<Promise<string> | null>(null);

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
    document.documentElement.classList.toggle("onramp-active", mode === "card");
    return () => document.documentElement.classList.remove("onramp-active");
  }, [mode]);

  const fetchCardClientSecret = useCallback(async () => {
    if (!cardSecretPromiseRef.current) {
      const req = cardRequestRef.current;
      if (!req) throw new Error("Card checkout not ready");
      cardSecretPromiseRef.current = (async () => {
        const res = await fetch("/api/checkout/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req),
        });
        const data = (await res.json()) as {
          clientSecret?: string;
          error?: string;
        };
        if (!res.ok || !data.clientSecret) {
          throw new Error(data.error || "Could not start card checkout");
        }
        return data.clientSecret;
      })();
    }
    return cardSecretPromiseRef.current;
  }, []);

  const cardOptions = useMemo(
    () => ({ fetchClientSecret: fetchCardClientSecret }),
    [fetchCardClientSecret],
  );

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
    if (!publishableKey || !stripePromise) {
      setError("Card checkout is not configured.");
      return;
    }

    setLoading(true);
    try {
      cardRequestRef.current = {
        amountUsd,
        email: email.trim() || undefined,
        network,
        wallet: normalizedWallet,
      };
      cardSecretPromiseRef.current = null;
      setWallet(normalizedWallet);
      setPaidAmount(amountUsd);
      setCardReady(true);
      setMode("card");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed to start");
    } finally {
      setLoading(false);
    }
  }

  function resetToPick() {
    cardRequestRef.current = null;
    cardSecretPromiseRef.current = null;
    setCardReady(false);
    setPaidAmount(null);
    setError(null);
    setMode("pick");
  }

  if (mode === "card" && paidAmount != null && cardReady && stripePromise) {
    return (
      <div className="payment-stack onramp-focus">
        <div className="country-lock" aria-label="Billing country">
          <span className="country-lock-code">FI</span>
          <span className="country-lock-name">Finland</span>
          <span className="country-lock-note">Card on this page</span>
        </div>
        <div className="destination-summary">
          <p>
            Pay <strong>{formatUsd(paidAmount)}</strong> →{" "}
            <code className="break">{wallet.trim()}</code>
          </p>
          <button type="button" className="ghost-link" onClick={resetToPick}>
            Change details
          </button>
        </div>
        <p className="form-hint">
          Fill your card below. You stay on this page. After payment clears, we
          send crypto to your wallet.
        </p>
        <div className="stripe-embed">
          <EmbeddedCheckoutProvider
            key={`${paidAmount}-${wallet.trim()}`}
            stripe={stripePromise}
            options={cardOptions}
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
        <div className="country-lock" aria-label="Billing country">
          <span className="country-lock-code">FI</span>
          <span className="country-lock-name">Finland</span>
          <span className="country-lock-note">Approved market</span>
        </div>

        <h2>Buy crypto</h2>
        <p>
          Pay by card on this page. Funds go to our Stripe account, then crypto
          is sent to your wallet. No new tab or off-site link.
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
        {!publishableKey ? (
          <p className="form-error">
            Card checkout keys are missing. Add Stripe publishable key and
            redeploy.
          </p>
        ) : null}

        <button
          type="button"
          className="primary-cta"
          onClick={startPay}
          disabled={loading || !canStart}
        >
          {loading
            ? "Opening card form…"
            : `Continue to card ${amountOk ? amountLabel : rangeLabel}`}
        </button>
        <p className="form-hint">
          Next: secure card form on this page. After you pay, we deliver crypto
          to the wallet above.
        </p>
      </div>
    </div>
  );
}
