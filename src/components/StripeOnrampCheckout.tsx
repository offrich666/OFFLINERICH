"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadStripeOnramp } from "@stripe/crypto";
import {
  ONRAMP_CURRENCIES,
  ONRAMP_NETWORKS,
  TREASURY,
  defaultOnrampAmountUsd,
  type OnrampCurrency,
  type OnrampNetwork,
} from "@/lib/treasury";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
const paymentLinkUrl =
  process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK_URL ||
  "https://buy.stripe.com/eVq8wReu5cHm8WA8crds406";

type Props = {
  amountUsd?: string;
};

export function StripeOnrampCheckout({ amountUsd }: Props) {
  const amount = amountUsd || defaultOnrampAmountUsd();
  const [network, setNetwork] = useState<OnrampNetwork>("polygon");
  const [currency, setCurrency] = useState<OnrampCurrency>("usdc");
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(
    publishableKey
      ? null
      : "Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (use live pk_live_… from G N LABS LLC).",
  );
  const [loading, setLoading] = useState(false);
  const mountRef = useRef<HTMLDivElement>(null);

  const startOnramp = useCallback(async () => {
    if (!publishableKey) {
      setError("Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (use live pk_live_…).");
      return;
    }
    setLoading(true);
    setError(null);
    setStatus("Creating live onramp session…");

    try {
      const res = await fetch("/api/onramp/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountUsd: amount, network, currency }),
      });
      const data = (await res.json()) as {
        clientSecret?: string;
        error?: string;
        livemode?: boolean;
      };
      if (!res.ok || !data.clientSecret) {
        throw new Error(
          data.error ||
            "Could not create Crypto Onramp session. Submit the Onramp application in Stripe Dashboard if this account is not enrolled yet.",
        );
      }

      if (mountRef.current) {
        mountRef.current.innerHTML = "";
      }

      const stripeOnramp = await loadStripeOnramp(publishableKey);
      if (!stripeOnramp) {
        throw new Error("Failed to load Stripe Onramp SDK");
      }

      const session = stripeOnramp.createSession({
        clientSecret: data.clientSecret,
        appearance: { theme: "dark" },
      });

      session.addEventListener("onramp_session_updated", (e) => {
        const next = e.payload?.session?.status;
        if (next) setStatus(`Onramp: ${next}`);
      });

      if (mountRef.current) {
        session.mount(mountRef.current);
        setStatus(
          data.livemode
            ? "Live onramp ready — crypto delivers to treasury wallets"
            : "Onramp mounted (not livemode keys)",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onramp failed");
      setStatus("");
    } finally {
      setLoading(false);
    }
  }, [amount, currency, network]);

  // Prefer USDC on EVM nets; BTC only on bitcoin
  useEffect(() => {
    if (network === "bitcoin" && currency !== "btc") setCurrency("btc");
    if (network !== "bitcoin" && currency === "btc") setCurrency("usdc");
  }, [network, currency]);

  return (
    <div className="payment-stack stripe-onramp">
      <div className="treasury-box">
        <h2>Treasury delivery</h2>
        <p>
          You pay with card / Apple Pay / Google Pay. Stripe Onramp converts to
          crypto and sends it to the locked OFFLINERICH treasury (not your own
          wallet).
        </p>
        <dl className="meta-list compact">
          <div>
            <dt>ETH / Polygon / Base</dt>
            <dd>
              <code>{TREASURY.evm}</code>
            </dd>
          </div>
          <div>
            <dt>BTC</dt>
            <dd>
              <code>{TREASURY.bitcoin}</code>
            </dd>
          </div>
          <div>
            <dt>BSC</dt>
            <dd>
              <code>{TREASURY.bsc}</code>
              <span className="hint"> — not on Stripe Onramp; use Polygon/Base/ETH</span>
            </dd>
          </div>
        </dl>
      </div>

      <div className="onramp-controls">
        <label>
          Network
          <select
            value={network}
            onChange={(e) => setNetwork(e.target.value as OnrampNetwork)}
          >
            {ONRAMP_NETWORKS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Asset
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as OnrampCurrency)}
          >
            {ONRAMP_CURRENCIES.filter((c) =>
              network === "bitcoin" ? c === "btc" : c !== "btc",
            ).map((c) => (
              <option key={c} value={c}>
                {c.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <label>
          USD
          <input value={amount} readOnly />
        </label>
      </div>

      <button
        type="button"
        className="primary-cta"
        onClick={startOnramp}
        disabled={loading}
      >
        {loading ? "Starting…" : "Pay → crypto to treasury"}
      </button>

      {status ? <p className="fineprint">{status}</p> : null}
      {error ? (
        <div className="blocked-hint">
          <strong>Onramp not ready on this Stripe account yet</strong>
          <p>{error}</p>
          <ol>
            <li>
              Open{" "}
              <a
                href="https://dashboard.stripe.com/crypto-onramp/get-started"
                target="_blank"
                rel="noreferrer"
              >
                Stripe Crypto Onramp application
              </a>{" "}
              on <strong>G N LABS LLC</strong> (live) and submit it.
            </li>
            <li>
              Put <code>pk_live_…</code> / <code>sk_live_…</code> (or restricted{" "}
              <code>rk_live_…</code>) into <code>.env.local</code>.
            </li>
            <li>
              Until Onramp is approved, use the live Payment Link (fiat settles to
              Stripe; convert/payout USDC to treasury from Dashboard):
            </li>
          </ol>
          <p>
            <a className="primary-cta" href={paymentLinkUrl} target="_blank" rel="noreferrer">
              Live pay $1 (Stripe Payment Link)
            </a>
          </p>
        </div>
      ) : null}

      <div ref={mountRef} className="stripe-embed onramp-mount" />
    </div>
  );
}
