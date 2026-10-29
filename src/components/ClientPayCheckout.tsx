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

type OnrampStatus = {
  readyForOnrampUi?: boolean;
  keys?: {
    mode?: string;
    publishableValid?: boolean;
    publishableError?: string | null;
  };
  application?: { submitted?: boolean; approved?: boolean };
  nextSteps?: string[];
};

function friendlyOnrampStatus(raw: string | undefined): string {
  switch (raw) {
    case "initialized":
      return "Payment form ready — enter card or choose Apple Pay / Google Pay below.";
    case "rejected":
      return "Payment was rejected. Change details and try again.";
    case "requires_payment":
      return "Complete payment in the form below.";
    case "fulfillment_processing":
      return "Payment received — delivering crypto…";
    case "fulfillment_complete":
      return "Done — crypto delivered to treasury for your wallet.";
    default:
      return raw ? `Status: ${raw}` : "";
  }
}

export function ClientPayCheckout() {
  const rangeLabel = checkoutAmountRangeLabel();
  const [amountInput, setAmountInput] = useState("10");
  const [network, setNetwork] = useState<ClientNetworkId>("ethereum");
  const [wallet, setWallet] = useState("");
  const [mode, setMode] = useState<"idle" | "onramp">("idle");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [onrampStatus, setOnrampStatus] = useState<OnrampStatus | null>(null);
  const onrampMountRef = useRef<HTMLDivElement>(null);
  const clientSecretRef = useRef<string | null>(null);

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

  // Focus layout on the pay widget (hide marketing copy on mobile).
  useEffect(() => {
    document.documentElement.classList.toggle("onramp-active", mode === "onramp");
    return () => {
      document.documentElement.classList.remove("onramp-active");
    };
  }, [mode]);

  // Mount onramp after the pay UI is painted so the container exists.
  useEffect(() => {
    if (mode !== "onramp" || !clientSecretRef.current || !publishableKey) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (onrampMountRef.current) onrampMountRef.current.innerHTML = "";
        const stripeOnramp = await loadStripeOnramp(publishableKey);
        if (!stripeOnramp || cancelled) {
          throw new Error("Failed to load Stripe Onramp");
        }
        const session = stripeOnramp.createSession({
          clientSecret: clientSecretRef.current!,
          appearance: { theme: "dark" },
        });
        session.addEventListener("onramp_session_updated", (e) => {
          const next = e.payload?.session?.status as string | undefined;
          setStatus(friendlyOnrampStatus(next));
        });
        if (onrampMountRef.current && !cancelled) {
          session.mount(onrampMountRef.current);
          setStatus(friendlyOnrampStatus("initialized"));
          // Bring the Stripe form into view on phones (form sits below marketing copy).
          requestAnimationFrame(() => {
            onrampMountRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load the on-page payment form",
          );
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
      setError("Stripe publishable key missing on this deploy.");
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
        code?: string;
      };
      if (!res.ok || !data.clientSecret) {
        throw new Error(data.error || "Could not start on-page checkout");
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
            Paying <strong>{amountLabel}</strong> · delivery on{" "}
            <strong>{network}</strong> to
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
            Change details
          </button>
        </div>
        {status ? <p className="form-hint">{status}</p> : null}
        <p className="fineprint onramp-scroll-hint">
          Use the Stripe form below — card, Apple Pay, or Google Pay.
        </p>
        <div ref={onrampMountRef} className="stripe-embed onramp-mount" />
      </div>
    );
  }

  return (
    <div className="payment-stack client-pay">
      <div className="setup-panel soft">
        <h2>Your delivery wallet</h2>
        <p>
          Amount ({rangeLabel}), network, and wallet. Pay on this page with
          card, Apple Pay, or Google Pay (Samsung Pay on Android via Google
          Pay).
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

        {onrampStatus?.keys?.publishableValid === false ? (
          <p className="form-error">
            Stripe publishable key is invalid on this deploy (
            {onrampStatus.keys.publishableError || "pk_live rejected"}).
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
          You stay on this site. Stripe Crypto Onramp collects payment; crypto
          settles to OFFLINERICH treasury, then delivery to your wallet.
        </p>
      </div>
    </div>
  );
}
