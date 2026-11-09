"use client";

import { useEffect, useState } from "react";
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

type PayPath = "instant" | "card";
type Mode = "pick" | "transak" | "crossmint" | "card";

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
      setNote("Done. Crypto is on the way to your wallet.");
    } else if (order.phase === "delivery") {
      setNote("Payment received. Delivering crypto to your wallet…");
    } else if (order.phase === "payment") {
      setNote("Enter card details below. Crypto goes straight to your wallet.");
    }
  }, [order]);

  if (!note) return null;
  return <p className="form-hint">{note}</p>;
}

/**
 * Instant = Transak (preferred) or Crossmint when keys exist → crypto to wallet.
 * Card = Stripe Checkout fallback (ops send) when Instant providers aren't ready.
 */
export function ClientPayCheckout() {
  const rangeLabel = checkoutAmountRangeLabel();
  const [path, setPath] = useState<PayPath>("instant");
  const [amountInput, setAmountInput] = useState(String(MIN_AMOUNT_USD));
  const [email, setEmail] = useState("");
  const [network, setNetwork] = useState<ClientNetworkId>("ethereum");
  const [wallet, setWallet] = useState("");
  const [mode, setMode] = useState<Mode>("pick");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paidAmount, setPaidAmount] = useState<number | null>(null);
  const [cardSecret, setCardSecret] = useState<string | null>(null);
  const [transakUrl, setTransakUrl] = useState<string | null>(null);
  const [transakReady, setTransakReady] = useState<boolean | null>(null);
  const [signupUrl, setSignupUrl] = useState<string | null>(null);
  const [crossmintOrder, setCrossmintOrder] = useState<CrossmintOrder | null>(
    null,
  );

  const amountUsd = parseAmountUsd(amountInput);
  const amountOk = amountUsd != null && isValidAmountUsd(amountUsd);
  const amountLabel = amountOk ? formatUsd(amountUsd!) : rangeLabel;
  const networks =
    path === "instant" && crossmintClientKey && !transakReady
      ? CROSSMINT_CLIENT_NETWORKS
      : CLIENT_NETWORKS;
  const normalizedWallet = normalizeWalletAddress(network, wallet);
  const walletOk = isValidWalletAddress(network, wallet);
  const walletDirty = wallet.trim().length > 0;
  const emailOk =
    !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canStart = amountOk && walletOk && emailOk;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/onramp/transak/status");
        const data = (await res.json()) as {
          configured?: boolean;
          signupUrl?: string;
        };
        if (!cancelled) {
          setTransakReady(Boolean(data.configured));
          if (data.signupUrl) setSignupUrl(data.signupUrl);
        }
      } catch {
        if (!cancelled) setTransakReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      path === "instant" &&
      crossmintClientKey &&
      !transakReady &&
      !CROSSMINT_CLIENT_NETWORKS.some((n) => n.id === network)
    ) {
      setNetwork("polygon");
    }
  }, [path, network, transakReady]);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "onramp-active",
      mode === "transak" || mode === "crossmint" || mode === "card",
    );
    return () => document.documentElement.classList.remove("onramp-active");
  }, [mode]);

  useEffect(() => {
    if (mode !== "transak" || !transakUrl) return;
    const onMessage = (event: MessageEvent) => {
      const id = (event.data as { event_id?: string })?.event_id;
      if (id === "TRANSAK_ORDER_SUCCESSFUL") {
        setStatus("Paid — crypto is on the way to your wallet.");
      } else if (id === "TRANSAK_ORDER_FAILED") {
        setError("Payment failed. Try again or use Card.");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [mode, transakUrl]);

  async function startInstant() {
    // Prefer Transak (completes to wallet). Else Crossmint if client key present.
    if (transakReady !== false) {
      const res = await fetch("/api/onramp/transak/session", {
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
        url?: string;
        error?: string;
        code?: string;
        signupUrl?: string;
      };
      if (res.ok && data.url) {
        // Transak staging often refuses iframe embedding ("refused to connect").
        // Full-page open completes Instant: card → crypto to the locked wallet.
        setWallet(normalizedWallet);
        setPaidAmount(amountUsd!);
        setMode("transak");
        setStatus("Opening secure Instant checkout…");
        setTransakUrl(data.url);
        window.location.assign(data.url);
        return;
      }
      if (data.code === "transak_not_configured") {
        setTransakReady(false);
        if (data.signupUrl) setSignupUrl(data.signupUrl);
        // fall through to Crossmint
      } else {
        throw new Error(data.error || "Could not start instant crypto");
      }
    }

    if (!crossmintClientKey) {
      throw new Error(
        "Instant crypto needs Transak keys (dashboard.transak.com — staging works now) or Crossmint production access.",
      );
    }
    if (!email.trim()) {
      throw new Error("Email is required for this checkout.");
    }
    if (!isCrossmintClientNetwork(network)) {
      throw new Error("Choose Polygon, Base, or Solana for this checkout.");
    }

    const result = await createOnrampOrder({
      email: email.trim().toLowerCase(),
      amount: String(amountUsd),
      chain: network as OnrampChain,
      walletAddress: normalizedWallet,
    });
    if (!result.ok) {
      throw new Error(
        result.message ||
          "Instant provider not ready yet. Use Card, or add Transak staging keys.",
      );
    }
    if (!result.orderId || !result.clientSecret) {
      throw new Error(
        "Instant provider not ready yet. Use Card, or add Transak staging keys.",
      );
    }
    setCrossmintOrder({
      orderId: result.orderId,
      clientSecret: result.clientSecret,
      email: email.trim().toLowerCase(),
      walletAddress: result.walletAddress || normalizedWallet,
    });
    setPaidAmount(amountUsd!);
    setWallet(result.walletAddress || normalizedWallet);
    setMode("crossmint");
    setStatus("Enter card details below. Crypto goes straight to your wallet.");
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
      "Card pay clears here — crypto is sent to your wallet after payment.",
    );
  }

  async function startPay() {
    setError(null);
    setSignupUrl(null);
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
          : network === "solana"
            ? "Enter a valid Solana wallet."
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
    setTransakUrl(null);
    setCrossmintOrder(null);
    setCardSecret(null);
    setPaidAmount(null);
    setStatus("");
    setError(null);
    setMode("pick");
  }

  if (mode === "transak" && paidAmount != null) {
    return (
      <div className="payment-stack client-pay">
        <div className="setup-panel soft">
          <h2>Opening Instant checkout…</h2>
          <p>
            Pay with card. Crypto goes to{" "}
            <code className="break">{wallet.trim()}</code> on {network}.
          </p>
          {transakUrl ? (
            <p className="form-hint">
              If nothing opens,{" "}
              <a href={transakUrl} rel="noreferrer">
                continue Instant pay
              </a>
              .
            </p>
          ) : null}
          <button type="button" className="ghost-link" onClick={resetToPick}>
            Back
          </button>
        </div>
      </div>
    );
  }

  if (mode === "crossmint" && paidAmount != null && crossmintOrder) {
    return (
      <div className="payment-stack onramp-focus">
        <div className="destination-summary">
          <p>
            Instant pay <strong>{formatUsd(paidAmount)}</strong> → crypto to{" "}
            <code className="break">{wallet.trim()}</code> on {network}
          </p>
          <button type="button" className="ghost-link" onClick={resetToPick}>
            Change details
          </button>
        </div>
        <CheckoutErrorBoundary>
          <CrossmintProvider apiKey={crossmintClientKey}>
            <CrossmintCheckoutProvider>
              <CrossmintPhaseBanner />
              <div className="stripe-embed onramp-embed">
                <CrossmintEmbeddedCheckout
                  orderId={crossmintOrder.orderId}
                  clientSecret={crossmintOrder.clientSecret}
                  payment={{
                    receiptEmail: crossmintOrder.email,
                    crypto: { enabled: false },
                    fiat: {
                      enabled: true,
                      allowedMethods: {
                        card: true,
                        applePay: true,
                        googlePay: true,
                      },
                    },
                    defaultMethod: "fiat",
                  }}
                  appearance={checkoutAppearance}
                />
              </div>
            </CrossmintCheckoutProvider>
          </CrossmintProvider>
        </CheckoutErrorBoundary>
      </div>
    );
  }

  if (mode === "card" && paidAmount != null && cardSecret && stripePromise) {
    return (
      <div className="payment-stack onramp-focus">
        <div className="destination-summary">
          <p>
            Card pay <strong>{formatUsd(paidAmount)}</strong> → crypto to{" "}
            <code className="break">{wallet.trim()}</code> on {network}
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
          Instant sends crypto to your wallet after you pay. Card is a backup if
          Instant is not set up yet.
        </p>

        <div className="amount-chips path-chips" role="group" aria-label="Pay method">
          <button
            type="button"
            className={path === "instant" ? "amount-chip active" : "amount-chip"}
            onClick={() => setPath("instant")}
          >
            Instant
          </button>
          <button
            type="button"
            className={path === "card" ? "amount-chip active" : "amount-chip"}
            onClick={() => setPath("card")}
          >
            Card
          </button>
        </div>

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
              network === "bitcoin"
                ? "bc1…"
                : network === "solana"
                  ? "Solana address"
                  : "0x…"
            }
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {walletDirty && !walletOk ? (
          <p className="form-error">Enter a valid wallet for this network.</p>
        ) : null}

        <label className="field">
          Email {path === "instant" && !transakReady ? "(required)" : "(optional)"}
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
        {path === "instant" && transakReady === false && !crossmintClientKey ? (
          <p className="form-hint">
            Instant needs Transak staging keys from{" "}
            {signupUrl ? (
              <a href={signupUrl} target="_blank" rel="noreferrer">
                dashboard.transak.com
              </a>
            ) : (
              "dashboard.transak.com"
            )}
            . Until then, use Card.
          </p>
        ) : null}

        <button
          type="button"
          className="primary-cta"
          onClick={startPay}
          disabled={loading || !canStart}
        >
          {loading
            ? "Opening secure form…"
            : path === "card"
              ? `Pay with card ${amountOk ? amountLabel : rangeLabel}`
              : `Buy crypto ${amountOk ? amountLabel : rangeLabel}`}
        </button>
        <p className="form-hint">
          {path === "card"
            ? "Card clears on this page; crypto is sent to your wallet after payment."
            : "Instant delivers crypto to your wallet when payment completes."}
        </p>
      </div>
    </div>
  );
}
