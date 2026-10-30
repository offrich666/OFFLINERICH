"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { loadStripeOnramp } from "@stripe/crypto";
import {
  CLIENT_NETWORKS,
  ONRAMP_CLIENT_NETWORKS,
  MAX_AMOUNT_USD,
  MIN_AMOUNT_USD,
  checkoutAmountRangeLabel,
  formatUsd,
  isValidAmountUsd,
  isValidWalletAddress,
  parseAmountUsd,
  type ClientNetworkId,
  type OnrampClientNetworkId,
} from "@/lib/networks";
import { getStripePublishableKey } from "@/lib/stripePublic";

const publishableKey = getStripePublishableKey();
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;
const QUICK_AMOUNTS = [5, 10, 25, 50, 100, 250, 500, 1000] as const;

type PayPath = "easy" | "instant";
type Mode = "pick" | "card" | "onramp" | "done";

/**
 * Two paths:
 * - Easy card: normal Stripe Checkout (no crypto KYC). USD lands in Stripe;
 *   ops delivers crypto to the client's wallet from treasury.
 * - Instant crypto: Stripe Onramp (KYC). Crypto settles straight to their wallet.
 */
export function ClientPayCheckout() {
  const rangeLabel = checkoutAmountRangeLabel();
  const [path, setPath] = useState<PayPath>("easy");
  const [amountInput, setAmountInput] = useState(String(MIN_AMOUNT_USD));
  const [email, setEmail] = useState("");
  const [network, setNetwork] = useState<ClientNetworkId>("ethereum");
  const [wallet, setWallet] = useState("");
  const [mode, setMode] = useState<Mode>("pick");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paidAmount, setPaidAmount] = useState<number | null>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const secretRef = useRef<string | null>(null);
  const cardSecretRef = useRef<string | null>(null);
  const [cardSecret, setCardSecret] = useState<string | null>(null);

  const amountUsd = parseAmountUsd(amountInput);
  const amountOk = amountUsd != null && isValidAmountUsd(amountUsd);
  const amountLabel = amountOk ? formatUsd(amountUsd!) : rangeLabel;
  const networks =
    path === "instant" ? ONRAMP_CLIENT_NETWORKS : CLIENT_NETWORKS;
  const walletOk = isValidWalletAddress(network, wallet);
  const canStart = amountOk && walletOk;

  // Keep network valid when switching paths (instant only eth/btc).
  useEffect(() => {
    if (path === "instant" && !ONRAMP_CLIENT_NETWORKS.some((n) => n.id === network)) {
      setNetwork("ethereum");
    }
  }, [path, network]);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "onramp-active",
      mode === "onramp" || mode === "card",
    );
    return () => document.documentElement.classList.remove("onramp-active");
  }, [mode]);

  const fetchCardClientSecret = useCallback(async () => {
    if (!cardSecretRef.current) throw new Error("Card checkout not ready");
    return cardSecretRef.current;
  }, []);

  const cardOptions = useMemo(
    () => ({ fetchClientSecret: fetchCardClientSecret }),
    [fetchCardClientSecret],
  );

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
            setStatus("Payment complete — crypto is on the way to your wallet.");
            setMode("done");
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
    if (!walletOk) {
      setError(
        network === "bitcoin"
          ? "Enter a valid Bitcoin address (bc1… / 1… / 3…)."
          : "Enter a valid wallet address (0x + 40 hex).",
      );
      return;
    }
    if (!publishableKey) {
      setError("Stripe publishable key missing.");
      return;
    }

    setLoading(true);
    try {
      if (path === "easy") {
        const res = await fetch("/api/checkout/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountUsd,
            email: email.trim() || undefined,
            network,
            wallet: wallet.trim(),
          }),
        });
        const data = (await res.json()) as {
          clientSecret?: string;
          error?: string;
        };
        if (!res.ok || !data.clientSecret) {
          throw new Error(data.error || "Could not start card checkout");
        }
        cardSecretRef.current = data.clientSecret;
        setCardSecret(data.clientSecret);
        setPaidAmount(amountUsd);
        setMode("card");
      } else {
        if (!ONRAMP_CLIENT_NETWORKS.some((n) => n.id === network)) {
          throw new Error("Instant crypto supports Ethereum or Bitcoin only");
        }
        const res = await fetch("/api/onramp/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountUsd,
            email: email.trim() || undefined,
            network: network as OnrampClientNetworkId,
            wallet: wallet.trim(),
          }),
        });
        const data = (await res.json()) as {
          clientSecret?: string;
          error?: string;
        };
        if (!res.ok || !data.clientSecret) {
          throw new Error(data.error || "Could not start crypto checkout");
        }
        secretRef.current = data.clientSecret;
        setPaidAmount(amountUsd);
        setMode("onramp");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed to start");
    } finally {
      setLoading(false);
    }
  }

  function resetToPick() {
    secretRef.current = null;
    cardSecretRef.current = null;
    setCardSecret(null);
    setPaidAmount(null);
    setStatus("");
    setMode("pick");
  }

  if (mode === "done") {
    return (
      <div className="payment-stack client-pay">
        <div className="setup-panel soft">
          <h2>You’re set</h2>
          <p>
            Payment received
            {paidAmount ? ` (${formatUsd(paidAmount)})` : ""}. Crypto goes to{" "}
            <code className="break">{wallet.trim()}</code> on {network}.
          </p>
        </div>
      </div>
    );
  }

  if (mode === "card" && paidAmount != null && cardSecret && stripePromise) {
    return (
      <div className="payment-stack onramp-focus">
        <div className="destination-summary">
          <p>
            Easy card · <strong>{formatUsd(paidAmount)}</strong> →{" "}
            <code className="break">{wallet.trim()}</code>
          </p>
          <button type="button" className="ghost-link" onClick={resetToPick}>
            Change details
          </button>
        </div>
        <p className="form-hint">
          Pay with card / Apple Pay / Google Pay. No crypto identity check.
          After payment clears, we send crypto to your wallet.
        </p>
        <div className="stripe-embed">
          <EmbeddedCheckoutProvider stripe={stripePromise} options={cardOptions}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      </div>
    );
  }

  if (mode === "onramp" && paidAmount != null) {
    return (
      <div className="payment-stack onramp-focus">
        <div className="destination-summary">
          <p>
            Instant crypto · <strong>{formatUsd(paidAmount)}</strong> →{" "}
            <code className="break">{wallet.trim()}</code>
          </p>
          <button type="button" className="ghost-link" onClick={resetToPick}>
            Change details
          </button>
        </div>
        {status ? <p className="form-hint">{status}</p> : null}
        <div ref={mountRef} className="stripe-embed onramp-mount" />
        <p className="fineprint">
          Stripe may ask for a short identity check. When it asks to confirm a
          wallet, that is <strong>your</strong> address from the step above.
        </p>
      </div>
    );
  }

  return (
    <div className="payment-stack client-pay">
      <div className="setup-panel soft">
        <h2>Pay</h2>
        <p>
          Enter your wallet and amount. Choose easy card (no crypto KYC) or
          instant crypto (Stripe Onramp).
        </p>

        <div className="amount-chips path-chips" role="group" aria-label="Pay method">
          <button
            type="button"
            className={path === "easy" ? "amount-chip active" : "amount-chip"}
            onClick={() => setPath("easy")}
          >
            Easy card
          </button>
          <button
            type="button"
            className={path === "instant" ? "amount-chip active" : "amount-chip"}
            onClick={() => setPath("instant")}
          >
            Instant crypto
          </button>
        </div>
        <p className="form-hint">
          {path === "easy"
            ? "Card only — no crypto KYC. We deliver crypto to your wallet after payment clears."
            : "Stripe Onramp — short KYC, crypto settles straight to your wallet."}
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
            {networks.map((n) => (
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
          disabled={loading || !canStart}
        >
          {loading
            ? "Starting…"
            : path === "easy"
              ? `Continue with card ${amountOk ? amountLabel : rangeLabel}`
              : `Continue to crypto ${amountOk ? amountLabel : rangeLabel}`}
        </button>
      </div>
    </div>
  );
}
