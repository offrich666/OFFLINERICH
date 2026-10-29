"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { loadStripeOnramp } from "@stripe/crypto";
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
  parseAmountUsd,
  type ClientNetworkId,
} from "@/lib/networks";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;
const paymentLinkUrl =
  process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK_URL ||
  "https://buy.stripe.com/aFafZj4TvdLq8WAboDds408";

type PayMode = "idle" | "onramp" | "checkout";

type OnrampStatus = {
  readyForOnrampUi?: boolean;
  keys?: { mode?: string };
  application?: { submitted?: boolean; approved?: boolean };
};

export function ClientPayCheckout() {
  const rangeLabel = checkoutAmountRangeLabel();
  const [amountInput, setAmountInput] = useState("10");
  const [network, setNetwork] = useState<ClientNetworkId>("ethereum");
  const [wallet, setWallet] = useState("");
  const [mode, setMode] = useState<PayMode>("idle");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [onrampStatus, setOnrampStatus] = useState<OnrampStatus | null>(null);
  const onrampMountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/onramp/status")
      .then((r) => r.json())
      .then((data: OnrampStatus) => {
        if (!cancelled) setOnrampStatus(data);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const amountUsd = parseAmountUsd(amountInput);
  const amountOk = amountUsd != null && isValidAmountUsd(amountUsd);
  const amountLabel = amountOk ? formatUsd(amountUsd!) : rangeLabel;

  const asset = useMemo(
    () => CLIENT_NETWORKS.find((n) => n.id === network)?.asset ?? "USDC",
    [network],
  );

  const walletOk = isValidWalletAddress(network, wallet);

  const fetchCheckoutSecret = useCallback(async () => {
    const res = await fetch("/api/checkout/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        network,
        wallet: wallet.trim(),
        asset,
        amountUsd,
      }),
    });
    const data = (await res.json()) as { clientSecret?: string; error?: string };
    if (!res.ok || !data.clientSecret) {
      throw new Error(data.error || "Could not start checkout");
    }
    return data.clientSecret;
  }, [amountUsd, asset, network, wallet]);

  async function startOnrampToTreasury() {
    if (!publishableKey) {
      throw new Error("missing_keys");
    }
    const res = await fetch("/api/onramp/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amountUsd,
        network,
        wallet: wallet.trim(),
        asset,
      }),
    });
    const data = (await res.json()) as {
      clientSecret?: string;
      redirectUrl?: string | null;
      error?: string;
      code?: string;
      applyUrl?: string;
    };
    if (!res.ok || !data.clientSecret) {
      const err = new Error(data.error || "Onramp unavailable") as Error & {
        code?: string;
        applyUrl?: string;
      };
      err.code = data.code;
      err.applyUrl = data.applyUrl;
      throw err;
    }

    // Prefer embedded Onramp; fall back to Stripe-hosted redirect_url
    try {
      if (onrampMountRef.current) onrampMountRef.current.innerHTML = "";
      const stripeOnramp = await loadStripeOnramp(publishableKey);
      if (!stripeOnramp) throw new Error("Failed to load Stripe Onramp");

      const session = stripeOnramp.createSession({
        clientSecret: data.clientSecret,
        appearance: { theme: "dark" },
      });
      session.addEventListener("onramp_session_updated", (e) => {
        const next = e.payload?.session?.status;
        if (next) setStatus(`Status: ${next}`);
      });
      if (onrampMountRef.current) session.mount(onrampMountRef.current);
      setMode("onramp");
      setStatus(
        "Pay now — crypto settles to OFFLINERICH treasury, then delivery to your wallet.",
      );
    } catch (embedErr) {
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      throw embedErr;
    }
  }

  async function continueToPay() {
    setError(null);
    setStatus("");
    if (!amountOk) {
      setError(
        `Enter an amount from ${formatUsd(MIN_AMOUNT_USD)} to ${formatUsd(MAX_AMOUNT_USD)}.`,
      );
      return;
    }
    if (!walletOk) {
      setError(
        network === "bitcoin"
          ? "Enter a valid Bitcoin address (bc1… / 1… / 3…)."
          : "Enter a valid EVM wallet address (0x + 40 hex chars).",
      );
      return;
    }

    setLoading(true);
    try {
      // Preferred: Crypto Onramp → YOUR treasury receives crypto when client pays.
      await startOnrampToTreasury();
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : "";
      // Fallback: USD Checkout / Payment Link (no crypto-in until Onramp unlocked)
      if (
        code === "onramp_not_enabled" ||
        code === "missing_keys" ||
        code === "onramp_error" ||
        !publishableKey
      ) {
        if (publishableKey && stripePromise) {
          setMode("checkout");
          setError(
            "Onramp is approved but keys are missing or the session failed. Using USD checkout fallback — paste live pk_live_/sk_live_ keys to receive crypto.",
          );
        } else {
          window.location.href = paymentLinkUrl;
          return;
        }
      } else {
        setError(err instanceof Error ? err.message : "Payment failed to start");
      }
    } finally {
      setLoading(false);
    }
  }

  if (mode === "onramp") {
    return (
      <div className="payment-stack">
        <div className="destination-summary">
          <p>
            Paying <strong>{amountLabel}</strong> · delivery on{" "}
            <strong>{network}</strong> to
          </p>
          <code>{wallet.trim()}</code>
          <button type="button" className="ghost-link" onClick={() => setMode("idle")}>
            Change details
          </button>
        </div>
        {status ? <p className="fineprint">{status}</p> : null}
        <div ref={onrampMountRef} className="stripe-embed onramp-mount" />
      </div>
    );
  }

  if (mode === "checkout" && stripePromise) {
    return (
      <div className="payment-stack">
        <div className="destination-summary">
          <p>
            Paying <strong>{amountLabel}</strong> · delivery on{" "}
            <strong>{network}</strong> to
          </p>
          <code>{wallet.trim()}</code>
          <button type="button" className="ghost-link" onClick={() => setMode("idle")}>
            Change details
          </button>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="stripe-embed">
          <EmbeddedCheckoutProvider
            stripe={stripePromise}
            options={{ fetchClientSecret: fetchCheckoutSecret }}
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
        <h2>Your delivery wallet</h2>
        <p>
          Amount ({rangeLabel}), network, and wallet. Pay with card, Apple Pay,
          or Google Pay.
        </p>

        <label className="field">
          Amount (USD)
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
          Wallet address
          <input
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            placeholder={network === "bitcoin" ? "bc1…" : "0x…"}
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        {error ? <p className="form-error">{error}</p> : null}

        {onrampStatus?.application?.approved &&
        !onrampStatus.readyForOnrampUi ? (
          <p className="form-hint">
            Onramp <strong>approved</strong> for G N LABS. Paste{" "}
            <strong>live</strong> API keys from{" "}
            <a
              href="https://dashboard.stripe.com/apikeys"
              target="_blank"
              rel="noreferrer"
            >
              Dashboard → API keys
            </a>{" "}
            (`pk_live_…` / `sk_live_…`) into env secrets, then restart. Crypto
            settles to Ethereum/Bitcoin treasury (EU). Until keys are set, pay
            falls back to USD.
          </p>
        ) : null}

        <button
          type="button"
          className="primary-cta"
          onClick={continueToPay}
          disabled={loading}
        >
          {loading
            ? "Starting…"
            : `Continue to pay ${amountOk ? amountLabel : rangeLabel}`}
        </button>

        <p className="fineprint">
          Preferred: Stripe Crypto Onramp → crypto to OFFLINERICH treasury →
          delivery to your wallet. Without Onramp keys, falls back to USD
          Payment Link.
        </p>
      </div>
    </div>
  );
}
