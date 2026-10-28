"use client";

import { useCallback, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import {
  CLIENT_NETWORKS,
  checkoutAmountUsdLabel,
  isValidWalletAddress,
  type ClientNetworkId,
} from "@/lib/networks";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;
const paymentLinkUrl =
  process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK_URL ||
  "https://buy.stripe.com/4gM4gB4TvfTyegU2S7ds407";

export function ClientPayCheckout() {
  const amountLabel = checkoutAmountUsdLabel();
  const [network, setNetwork] = useState<ClientNetworkId>("polygon");
  const [wallet, setWallet] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      }),
    });
    const data = (await res.json()) as { clientSecret?: string; error?: string };
    if (!res.ok || !data.clientSecret) {
      throw new Error(data.error || "Could not start checkout");
    }
    return data.clientSecret;
  }, [asset, network, wallet]);

  function continueToPay() {
    setError(null);
    if (!walletOk) {
      setError(
        network === "bitcoin"
          ? "Enter a valid Bitcoin address (bc1… / 1… / 3…)."
          : "Enter a valid EVM wallet address (0x + 40 hex chars).",
      );
      return;
    }
    if (!publishableKey || !stripePromise) {
      // Live path without local secret/publishable keys: Stripe-hosted link
      // collects network + wallet on their page (Apple Pay / Google Pay / card).
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
            Delivering <strong>{asset}</strong> on <strong>{network}</strong> to
          </p>
          <code>{wallet.trim()}</code>
          <button
            type="button"
            className="ghost-link"
            onClick={() => setReady(false)}
          >
            Change wallet
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
          Pay {amountLabel} with card, Apple Pay, or Google Pay. Crypto is sent
          to your wallet after payment clears.
        </p>
      </div>
    );
  }

  return (
    <div className="payment-stack client-pay">
      <div className="setup-panel soft">
        <h2>Your delivery wallet</h2>
        <p>
          Choose the network and paste the wallet that should receive crypto.
          Then pay {amountLabel} with card, Apple Pay, or Google Pay.
        </p>

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
            placeholder={
              network === "bitcoin"
                ? "bc1…"
                : "0x…"
            }
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        {error ? <p className="form-error">{error}</p> : null}

        <button type="button" className="primary-cta" onClick={continueToPay}>
          Continue to pay {amountLabel}
        </button>

        {!publishableKey ? (
          <p className="fineprint">
            Opens secure Stripe Checkout (live) with Apple Pay, Google Pay, and
            card. You will confirm network + wallet on the payment page.
          </p>
        ) : (
          <p className="fineprint">
            Next step embeds Stripe Checkout on this page (card / Apple Pay /
            Google Pay).
          </p>
        )}
      </div>
    </div>
  );
}
