"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

/**
 * Stripe Crypto Onramp → crypto settles to OFFLINERICH treasury wallets
 * when the client pays. Client wallet is only for later delivery from treasury.
 */
export function ClientPayCheckout() {
  const rangeLabel = checkoutAmountRangeLabel();
  const [amountInput, setAmountInput] = useState("10");
  const [network, setNetwork] = useState<ClientNetworkId>("ethereum");
  const [wallet, setWallet] = useState("");
  const [mode, setMode] = useState<"idle" | "onramp">("idle");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const onrampMountRef = useRef<HTMLDivElement>(null);
  const clientSecretRef = useRef<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("onramp-active", mode === "onramp");
    return () => document.documentElement.classList.remove("onramp-active");
  }, [mode]);

  useEffect(() => {
    if (mode !== "onramp" || !clientSecretRef.current || !publishableKey) return;
    let cancelled = false;
    (async () => {
      try {
        if (onrampMountRef.current) onrampMountRef.current.innerHTML = "";
        const stripeOnramp = await loadStripeOnramp(publishableKey);
        if (!stripeOnramp || cancelled) throw new Error("Failed to load pay form");
        const session = stripeOnramp.createSession({
          clientSecret: clientSecretRef.current!,
          appearance: { theme: "dark" },
        });
        session.addEventListener("onramp_session_updated", (e) => {
          const next = e.payload?.session?.status as string | undefined;
          if (next === "fulfillment_complete") {
            setStatus("Paid — crypto is in the OFFLINERICH treasury. Delivery to your wallet follows.");
          } else if (next === "fulfillment_processing") {
            setStatus("Payment received — crypto settling to treasury…");
          } else if (next === "initialized" || next === "requires_payment") {
            setStatus("Complete payment below. Crypto goes to treasury when you pay.");
          } else if (next) {
            setStatus(`Status: ${next}`);
          }
        });
        if (onrampMountRef.current && !cancelled) {
          session.mount(onrampMountRef.current);
          setStatus("Complete payment below. Crypto goes to treasury when you pay.");
          requestAnimationFrame(() => {
            onrampMountRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not open payment");
          setMode("idle");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const amountUsd = parseAmountUsd(amountInput);
  const amountOk = amountUsd != null && isValidAmountUsd(amountUsd);
  const amountLabel = amountOk ? formatUsd(amountUsd!) : rangeLabel;
  const asset = useMemo(
    () => CLIENT_NETWORKS.find((n) => n.id === network)?.asset ?? "USDC",
    [network],
  );
  const walletOk = isValidWalletAddress(network, wallet);

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
          network,
          wallet: wallet.trim(),
          asset,
        }),
      });
      const data = (await res.json()) as {
        clientSecret?: string;
        error?: string;
      };
      if (!res.ok || !data.clientSecret) {
        throw new Error(data.error || "Could not start crypto checkout");
      }
      clientSecretRef.current = data.clientSecret;
      setMode("onramp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed to start");
    } finally {
      setLoading(false);
    }
  }

  if (mode === "onramp") {
    return (
      <div className="payment-stack onramp-focus">
        <div className="destination-summary">
          <p>
            Pay <strong>{amountLabel}</strong> · you receive {asset} on{" "}
            <strong>{network}</strong>
          </p>
          <code>{wallet.trim()}</code>
          <button
            type="button"
            className="ghost-link"
            onClick={() => {
              clientSecretRef.current = null;
              setMode("idle");
              setStatus("");
            }}
          >
            Change
          </button>
        </div>
        {status ? <p className="form-hint">{status}</p> : null}
        <div ref={onrampMountRef} className="stripe-embed onramp-mount" />
      </div>
    );
  }

  return (
    <div className="payment-stack client-pay">
      <div className="setup-panel soft">
        <h2>Pay for crypto</h2>
        <p>
          Client pays card / Apple Pay / Google Pay. Crypto lands in OFFLINERICH
          treasury, then is sent to the wallet below.
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
          Client wallet (delivery)
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
          onClick={continueToPay}
          disabled={loading}
        >
          {loading ? "Starting…" : `Pay ${amountOk ? amountLabel : rangeLabel}`}
        </button>
      </div>
    </div>
  );
}
