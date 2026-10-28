"use client";

import { useCallback, useMemo, useState } from "react";
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
  parseAmountUsd,
  type ClientNetworkId,
} from "@/lib/networks";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;
const paymentLinkUrl =
  process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK_URL ||
  "https://buy.stripe.com/aFafZj4TvdLq8WAboDds408";

export function ClientPayCheckout() {
  const rangeLabel = checkoutAmountRangeLabel();
  const [amountInput, setAmountInput] = useState("10");
  const [network, setNetwork] = useState<ClientNetworkId>("polygon");
  const [wallet, setWallet] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountUsd = parseAmountUsd(amountInput);
  const amountOk = amountUsd != null && isValidAmountUsd(amountUsd);
  const amountLabel = amountOk ? formatUsd(amountUsd!) : rangeLabel;

  const asset = useMemo(
    () => CLIENT_NETWORKS.find((n) => n.id === network)?.asset ?? "USDC",
    [network],
  );

  const walletOk = isValidWalletAddress(network, wallet);

  const fetchClientSecret = useCallback(async () => {
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

  function continueToPay() {
    setError(null);
    if (!amountOk) {
      setError(`Enter an amount from ${formatUsd(MIN_AMOUNT_USD)} to ${formatUsd(MAX_AMOUNT_USD)}.`);
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
    if (!publishableKey || !stripePromise) {
      window.location.href = paymentLinkUrl;
      return;
    }
    setReady(true);
  }

  if (ready && stripePromise) {
    return (
      <div className="payment-stack">
        <div className="destination-summary">
          <p>
            Paying <strong>{amountLabel}</strong> → <strong>{asset}</strong> on{" "}
            <strong>{network}</strong> to
          </p>
          <code>{wallet.trim()}</code>
          <button
            type="button"
            className="ghost-link"
            onClick={() => setReady(false)}
          >
            Change details
          </button>
        </div>
        <div className="stripe-embed">
          <EmbeddedCheckoutProvider
            stripe={stripePromise}
            options={{ fetchClientSecret }}
          >
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
        <p className="fineprint">
          Pay with card, Apple Pay, or Google Pay. Crypto is sent to your wallet
          after payment clears.
        </p>
      </div>
    );
  }

  return (
    <div className="payment-stack client-pay">
      <div className="setup-panel soft">
        <h2>Your delivery wallet</h2>
        <p>
          Choose amount ({rangeLabel}), network, and wallet. Then pay with card,
          Apple Pay, or Google Pay.
        </p>

        <label className="field">
          Amount (USD)
          <input
            type="number"
            min={MIN_AMOUNT_USD}
            max={MAX_AMOUNT_USD}
            step="1"
            value={amountInput}
            onChange={(e) => {
              setAmountInput(e.target.value);
              setReady(false);
            }}
            placeholder={`${MIN_AMOUNT_USD}`}
          />
        </label>

        <label className="field">
          Network
          <select
            value={network}
            onChange={(e) => {
              setNetwork(e.target.value as ClientNetworkId);
              setReady(false);
            }}
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

        <button type="button" className="primary-cta" onClick={continueToPay}>
          Continue to pay {amountOk ? amountLabel : rangeLabel}
        </button>

        {!publishableKey ? (
          <p className="fineprint">
            Opens secure Stripe Checkout (live). Enter amount ({rangeLabel}),
            network, and wallet on the payment page.
          </p>
        ) : (
          <p className="fineprint">
            Next step embeds Stripe Checkout (card / Apple Pay / Google Pay).
          </p>
        )}
      </div>
    </div>
  );
}
