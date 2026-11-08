"use client";

import { useEffect, useState } from "react";
import {
  CrossmintCheckoutProvider,
  CrossmintEmbeddedCheckout,
  CrossmintProvider,
  useCrossmintCheckout,
} from "@crossmint/client-sdk-react-ui";
import { createOnrampOrder } from "@/app/actions/createOnrampOrder";
import { CheckoutErrorBoundary } from "@/components/CheckoutErrorBoundary";
import {
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
  type CrossmintClientNetworkId,
} from "@/lib/networks";
import {
  checkoutAppearance,
  getClientApiKey,
  type OnrampChain,
} from "@/lib/crossmint";

const crossmintClientKey = getClientApiKey();
const QUICK_AMOUNTS = [5, 10, 25, 50, 100, 250, 500, 1000] as const;

type Mode = "pick" | "crossmint";

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
      setNote("Enter your Finnish card details below to complete payment.");
    }
  }, [order]);

  if (!note) return null;
  return <p className="form-hint">{note}</p>;
}

/**
 * Finland-only Crossmint checkout.
 * Country is locked to Finland; buyers fill the card form in the embed.
 */
export function ClientPayCheckout() {
  const rangeLabel = checkoutAmountRangeLabel();
  const [amountInput, setAmountInput] = useState(String(MIN_AMOUNT_USD));
  const [email, setEmail] = useState("");
  const [network, setNetwork] =
    useState<CrossmintClientNetworkId>("polygon");
  const [wallet, setWallet] = useState("");
  const [mode, setMode] = useState<Mode>("pick");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paidAmount, setPaidAmount] = useState<number | null>(null);
  const [crossmintOrder, setCrossmintOrder] = useState<CrossmintOrder | null>(
    null,
  );
  const [mountKey, setMountKey] = useState(0);

  const amountUsd = parseAmountUsd(amountInput);
  const amountOk = amountUsd != null && isValidAmountUsd(amountUsd);
  const amountLabel = amountOk ? formatUsd(amountUsd!) : rangeLabel;
  const normalizedWallet = normalizeWalletAddress(network, wallet);
  const walletOk = isValidWalletAddress(network, wallet);
  const walletDirty = wallet.trim().length > 0;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canStart = amountOk && walletOk && emailOk && Boolean(crossmintClientKey);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "onramp-active",
      mode === "crossmint",
    );
    return () => document.documentElement.classList.remove("onramp-active");
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
        network === "solana"
          ? "Enter a valid Solana wallet address."
          : "Enter a valid wallet address (0x + 40 hex).",
      );
      return;
    }
    if (!emailOk) {
      setError("Enter a valid email.");
      return;
    }
    if (!crossmintClientKey) {
      setError("Checkout is not configured. Add Crossmint keys and redeploy.");
      return;
    }
    if (!isCrossmintClientNetwork(network)) {
      setError("Choose Polygon, Base, or Solana.");
      return;
    }

    setLoading(true);
    try {
      const result = await createOnrampOrder({
        email: email.trim().toLowerCase(),
        amount: amountUsd.toFixed(2),
        chain: network as OnrampChain,
        walletAddress: normalizedWallet,
      });

      if (!result.ok) {
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
    setPaidAmount(null);
    setCrossmintOrder(null);
    setError(null);
    setMode("pick");
  }

  if (mode === "crossmint" && crossmintOrder && crossmintClientKey) {
    return (
      <div className="payment-stack onramp-focus">
        <div className="country-lock" aria-label="Billing country">
          <span className="country-lock-code">FI</span>
          <span className="country-lock-name">Finland</span>
          <span className="country-lock-note">Cards only · EUR</span>
        </div>
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
                      defaultCurrency: "eur",
                      allowedMethods: {
                        card: true,
                        applePay: false,
                        googlePay: false,
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
          Finland only. Pay by card on this page — crypto goes straight to your
          wallet. No redirect off-site.
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
              setNetwork(e.target.value as CrossmintClientNetworkId)
            }
          >
            {CROSSMINT_CLIENT_NETWORKS.map((n) => (
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
            placeholder={network === "solana" ? "Solana address…" : "0x…"}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {walletDirty && !walletOk ? (
          <p className="form-error">
            {network === "solana"
              ? "Enter a valid Solana wallet address."
              : "Enter a valid wallet (0x + 40 hex characters)."}
          </p>
        ) : null}

        <label className="field">
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </label>
        {email.trim() && !emailOk ? (
          <p className="form-error">Enter a valid email.</p>
        ) : null}

        {error ? <p className="form-error">{error}</p> : null}
        {!crossmintClientKey ? (
          <p className="form-error">
            Checkout keys are missing on this deploy. Add Crossmint keys and
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
            ? "Opening secure card form…"
            : `Buy crypto ${amountOk ? amountLabel : rangeLabel}`}
        </button>
        <p className="form-hint">
          Card form opens on this page (EUR · Finland). Crypto is sent to your
          wallet.
        </p>
      </div>
    </div>
  );
}
