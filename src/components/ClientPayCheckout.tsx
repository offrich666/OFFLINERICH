"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import {
  CrossmintCheckoutProvider,
  CrossmintEmbeddedCheckout,
  CrossmintProvider,
  useCrossmintCheckout,
} from "@crossmint/client-sdk-react-ui";
import { createOnrampOrder } from "@/app/actions/createOnrampOrder";
import { CheckoutErrorBoundary } from "@/components/CheckoutErrorBoundary";
import {
  CLIENT_NETWORKS,
  CROSSMINT_CLIENT_NETWORKS,
  MAX_AMOUNT_USD,
  MIN_AMOUNT_USD,
  checkoutAmountRangeLabel,
  formatUsd,
  isCrossmintClientNetwork,
  isValidAmountUsd,
  isValidWalletAddress,
  normalizeWalletAddress,
  parseAmountUsd,
  type ClientNetworkId,
  type CrossmintClientNetworkId,
} from "@/lib/networks";
import {
  checkoutAppearance,
  getClientApiKey,
  type OnrampChain,
} from "@/lib/crossmint";
import { getStripePublishableKey } from "@/lib/stripePublic";

const publishableKey = getStripePublishableKey();
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;
const crossmintClientKey = getClientApiKey();
const QUICK_AMOUNTS = [5, 10, 25, 50, 100, 250, 500, 1000] as const;

type PayPath = "crypto" | "card";
type Mode = "pick" | "card" | "crossmint" | "redirecting" | "done";

type CrossmintOrder = {
  orderId: string;
  clientSecret: string;
  email: string;
  walletAddress: string;
};

function CrossmintPhaseBanner() {
  const { order } = useCrossmintCheckout();
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!order) return;
    if (order.phase === "completed") {
      setNote("Payment complete. Crypto is on the way to your wallet.");
    } else if (order.phase === "delivery") {
      setNote("Payment received. Delivering crypto…");
    } else if (order.phase === "payment") {
      setNote("Complete payment with card, Apple Pay, or Google Pay.");
    }
  }, [order]);

  if (!note) return null;
  return <p className="form-hint">{note}</p>;
}

/**
 * Crypto (default): Crossmint embedded fiat → USDC (card / Apple / Google).
 * Card: Stripe Embedded Checkout (USD) when treasury delivery is needed later.
 */
export function ClientPayCheckout() {
  const rangeLabel = checkoutAmountRangeLabel();
  const [path, setPath] = useState<PayPath>("crypto");
  const [amountInput, setAmountInput] = useState(String(MIN_AMOUNT_USD));
  const [email, setEmail] = useState("");
  const [network, setNetwork] = useState<ClientNetworkId>("polygon");
  const [wallet, setWallet] = useState("");
  const [mode, setMode] = useState<Mode>("pick");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paidAmount, setPaidAmount] = useState<number | null>(null);
  const [crossmintOrder, setCrossmintOrder] = useState<CrossmintOrder | null>(
    null,
  );
  const [mountKey, setMountKey] = useState(0);
  const cardRequestRef = useRef<{
    amountUsd: number;
    email?: string;
    network: string;
    wallet: string;
  } | null>(null);
  const cardSecretPromiseRef = useRef<Promise<string> | null>(null);
  const [cardReady, setCardReady] = useState(false);

  const amountUsd = parseAmountUsd(amountInput);
  const amountOk = amountUsd != null && isValidAmountUsd(amountUsd);
  const amountLabel = amountOk ? formatUsd(amountUsd!) : rangeLabel;
  const networks =
    path === "crypto" ? CROSSMINT_CLIENT_NETWORKS : CLIENT_NETWORKS;
  const normalizedWallet = normalizeWalletAddress(network, wallet);
  const walletOk = isValidWalletAddress(network, wallet);
  const walletDirty = wallet.trim().length > 0;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canStart =
    amountOk &&
    walletOk &&
    (path === "card" || emailOk);

  useEffect(() => {
    if (path === "crypto" && !isCrossmintClientNetwork(network)) {
      setNetwork("polygon");
    }
  }, [path, network]);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "onramp-active",
      mode === "card" || mode === "crossmint" || mode === "redirecting",
    );
    return () => document.documentElement.classList.remove("onramp-active");
  }, [mode]);

  async function startStripeInstantFallback(
    amount: number,
    net: CrossmintClientNetworkId | "ethereum",
    walletAddr: string,
    mail?: string,
  ) {
    // Stripe Instant only settles ethereum USDC / bitcoin for this merchant.
    const stripeNetwork = net === "solana" || net === "base" || net === "polygon"
      ? "ethereum"
      : net;
    const res = await fetch("/api/onramp/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amountUsd: amount,
        email: mail || undefined,
        network: stripeNetwork,
        wallet: walletAddr,
      }),
    });
    const data = (await res.json()) as {
      redirectUrl?: string | null;
      error?: string;
    };
    if (!res.ok || !data.redirectUrl) {
      throw new Error(
        data.error ||
          "Checkout is not fully enabled yet. Try again later or use Card.",
      );
    }
    setMode("redirecting");
    window.location.assign(data.redirectUrl);
  }

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

    setLoading(true);
    try {
      if (path === "card") {
        if (!publishableKey) {
          throw new Error("Card checkout is not configured.");
        }
        cardRequestRef.current = {
          amountUsd,
          email: email.trim() || undefined,
          network,
          wallet: normalizedWallet,
        };
        cardSecretPromiseRef.current = null;
        setWallet(normalizedWallet);
        setCardReady(true);
        setPaidAmount(amountUsd);
        setMode("card");
        return;
      }

      if (!crossmintClientKey) {
        throw new Error("Checkout is not configured. Try again later.");
      }
      if (!emailOk) {
        throw new Error("Enter a valid email for checkout.");
      }
      if (!isCrossmintClientNetwork(network)) {
        throw new Error("Choose Polygon, Base, or Solana.");
      }

      const result = await createOnrampOrder({
        email: email.trim().toLowerCase(),
        amount: amountUsd.toFixed(2),
        chain: network as OnrampChain,
        walletAddress: normalizedWallet,
      });

      if (!result.ok) {
        const blocked =
          /not yet enabled for production|staging\.crossmint|contact.*sales/i.test(
            result.message || "",
          );
        if (blocked) {
          if (network === "solana") {
            throw new Error(
              "This payment path is still being enabled. Choose Polygon or Base, or use Card.",
            );
          }
          // Production Crossmint onramp not unlocked yet — fall back to Stripe Instant.
          setWallet(normalizedWallet);
          setPaidAmount(amountUsd);
          await startStripeInstantFallback(
            amountUsd,
            network as CrossmintClientNetworkId,
            normalizedWallet,
            email.trim().toLowerCase(),
          );
          return;
        }
        throw new Error(result.message || "Could not start checkout");
      }

      setWallet(result.walletAddress || normalizedWallet);
      setPaidAmount(amountUsd);
      setCrossmintOrder({
        orderId: result.orderId,
        clientSecret: result.clientSecret,
        email: email.trim().toLowerCase(),
        walletAddress: result.walletAddress || normalizedWallet,
      });
      setMountKey((k) => k + 1);
      setMode("crossmint");
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
    setCrossmintOrder(null);
    setError(null);
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
          <button type="button" className="ghost-link" onClick={resetToPick}>
            New payment
          </button>
        </div>
      </div>
    );
  }

  if (mode === "redirecting") {
    return (
      <div className="payment-stack client-pay">
        <div className="setup-panel soft">
          <h2>Opening payment…</h2>
          <p>Continue on the secure payment page.</p>
        </div>
      </div>
    );
  }

  if (mode === "crossmint" && crossmintOrder && crossmintClientKey) {
    return (
      <div className="payment-stack onramp-focus">
        <div className="destination-summary">
          <p>
            Pay {paidAmount ? <strong>{formatUsd(paidAmount)}</strong> : null}{" "}
            → <code className="break">{crossmintOrder.walletAddress}</code>
          </p>
          <button type="button" className="ghost-link" onClick={resetToPick}>
            Change details
          </button>
        </div>
        <CheckoutErrorBoundary onReset={() => setMountKey((k) => k + 1)}>
          <CrossmintProvider key={mountKey} apiKey={crossmintClientKey}>
            <CrossmintCheckoutProvider>
              <div className="checkout-shell onramp-embed">
                <CrossmintPhaseBanner />
                <CrossmintEmbeddedCheckout
                  orderId={crossmintOrder.orderId}
                  clientSecret={crossmintOrder.clientSecret}
                  appearance={checkoutAppearance}
                  payment={{
                    receiptEmail: crossmintOrder.email,
                    defaultMethod: "fiat",
                    crypto: { enabled: false },
                    fiat: {
                      enabled: true,
                      defaultCurrency: "usd",
                      allowedMethods: {
                        card: true,
                        applePay: true,
                        googlePay: true,
                      },
                    },
                  }}
                />
              </div>
            </CrossmintCheckoutProvider>
          </CrossmintProvider>
        </CheckoutErrorBoundary>
      </div>
    );
  }

  if (mode === "card" && paidAmount != null && cardReady && stripePromise) {
    return (
      <div className="payment-stack onramp-focus">
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
          Pay with card, Apple Pay, or Google Pay. We’ll send crypto to your
          wallet after payment clears.
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
        <h2>Pay</h2>
        <p>Enter amount and wallet, then pay. That’s it.</p>

        <div className="amount-chips path-chips" role="group" aria-label="Pay method">
          <button
            type="button"
            className={path === "crypto" ? "amount-chip active" : "amount-chip"}
            onClick={() => setPath("crypto")}
          >
            Crypto
          </button>
          <button
            type="button"
            className={path === "card" ? "amount-chip active" : "amount-chip"}
            onClick={() => setPath("card")}
          >
            Card
          </button>
        </div>
        <p className="form-hint">
          {path === "crypto"
            ? "Card / Apple Pay / Google Pay → USDC to your wallet."
            : "Card pay now; crypto is sent when ready."}
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
          {path === "crypto" ? "Email" : "Email (optional)"}
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required={path === "crypto"}
          />
        </label>
        {path === "crypto" && email.trim() && !emailOk ? (
          <p className="form-error">Enter a valid email.</p>
        ) : null}

        {error ? <p className="form-error">{error}</p> : null}
        {path === "crypto" && !crossmintClientKey ? (
          <p className="form-error">
            Checkout keys are missing on this deploy. Add them and redeploy.
          </p>
        ) : null}

        <button
          type="button"
          className="primary-cta"
          onClick={startPay}
          disabled={loading || !canStart}
        >
          {loading ? "Starting…" : `Pay ${amountOk ? amountLabel : rangeLabel}`}
        </button>
      </div>
    </div>
  );
}
