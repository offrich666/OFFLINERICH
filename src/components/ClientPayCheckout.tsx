"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import {
  InstantCompleteCheckout,
  clearInstantSession,
  loadInstantSession,
} from "@/components/InstantCompleteCheckout";
import {
  MAX_AMOUNT_USD,
  MIN_AMOUNT_USD,
  checkoutAmountRangeLabel,
  formatUsd,
  isValidAmountUsd,
  isValidWalletAddress,
  normalizeWalletAddress,
  parseAmountUsd,
} from "@/lib/networks";
import {
  THIRDWEB_INSTANT_NETWORKS,
  isThirdwebInstantNetwork,
  type ThirdwebInstantNetworkId,
} from "@/lib/thirdwebPublic";
import { getStripePublishableKey } from "@/lib/stripePublic";

const publishableKey = getStripePublishableKey();
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;
const QUICK_AMOUNTS = [5, 10, 25, 50, 100, 250, 500, 1000] as const;

type PayPath = "instant" | "card";
type Mode = "pick" | "instant" | "card";

type InstantSession = {
  id: string;
  url: string;
};

/**
 * Instant = live card → crypto to wallet (thirdweb Transak/Coinbase).
 * Card = Stripe Embedded Checkout backup (slower delivery).
 */
export function ClientPayCheckout() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rangeLabel = checkoutAmountRangeLabel();
  const [path, setPath] = useState<PayPath>("instant");
  const [amountInput, setAmountInput] = useState(String(MIN_AMOUNT_USD));
  const [email, setEmail] = useState("");
  const [network, setNetwork] = useState<ThirdwebInstantNetworkId>("ethereum");
  const [wallet, setWallet] = useState("");
  const [mode, setMode] = useState<Mode>("pick");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paidAmount, setPaidAmount] = useState<number | null>(null);
  const [instant, setInstant] = useState<InstantSession | null>(null);
  const [resumePaid, setResumePaid] = useState(false);
  const [cardSecret, setCardSecret] = useState<string | null>(null);
  const [instantReady, setInstantReady] = useState(true);

  const amountUsd = parseAmountUsd(amountInput);
  const amountOk = amountUsd != null && isValidAmountUsd(amountUsd);
  const amountLabel = amountOk ? formatUsd(amountUsd!) : rangeLabel;
  const normalizedWallet = normalizeWalletAddress(network, wallet);
  const walletOk = isValidWalletAddress(network, wallet);
  const walletDirty = wallet.trim().length > 0;
  const emailOk =
    !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canStart =
    amountOk &&
    walletOk &&
    emailOk &&
    (path === "instant" ? instantReady : Boolean(publishableKey));

  useEffect(() => {
    let cancelled = false;
    fetch("/api/onramp/thirdweb/session")
      .then((r) => r.json())
      .then((data: { ready?: boolean }) => {
        if (cancelled) return;
        const ready = Boolean(data.ready);
        setInstantReady(ready);
        if (!ready) setPath("card");
      })
      .catch(() => {
        if (!cancelled) {
          setInstantReady(false);
          setPath("card");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Resume Instant after mobile return (?paid=1&sid=…)
  useEffect(() => {
    const paid = searchParams.get("paid") === "1";
    const sid = searchParams.get("sid")?.trim() || "";
    const saved = loadInstantSession();
    if (!paid && !saved) return;

    const id = sid || saved?.id;
    const url = saved?.url;
    if (!id || !url) return;

    setInstant({ id, url });
    setPaidAmount(
      typeof saved?.amountUsd === "number" && saved.amountUsd > 0
        ? saved.amountUsd
        : MIN_AMOUNT_USD,
    );
    if (saved?.walletAddress) setWallet(saved.walletAddress);
    if (saved?.network && isThirdwebInstantNetwork(saved.network)) {
      setNetwork(saved.network);
    }
    setResumePaid(paid);
    setMode("instant");
    setStatus(
      paid
        ? "Payment received — crypto is settling to your wallet."
        : "Continue payment to receive crypto in your wallet.",
    );

    if (paid) {
      router.replace("/checkout", { scroll: false });
    }
  }, [searchParams, router]);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "onramp-active",
      mode === "instant" || mode === "card",
    );
    return () => document.documentElement.classList.remove("onramp-active");
  }, [mode]);

  async function startInstant() {
    if (!instantReady) throw new Error("Instant is not configured yet.");
    if (!isThirdwebInstantNetwork(network)) {
      throw new Error("Choose Ethereum, Polygon, Base, or BNB Chain.");
    }
    const res = await fetch("/api/onramp/thirdweb/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amountUsd,
        network,
        wallet: normalizedWallet,
      }),
    });
    const data = (await res.json()) as {
      id?: string;
      url?: string;
      error?: string;
    };
    if (!res.ok || !data.id || !data.url) {
      throw new Error(data.error || "Could not start Instant");
    }
    setInstant({ id: data.id, url: data.url });
    setWallet(normalizedWallet);
    setPaidAmount(amountUsd!);
    setResumePaid(false);
    setMode("instant");
    setStatus("");
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
      "Card backup: pay here — crypto is sent after payment (not Instant).",
    );
  }

  async function startPay() {
    setError(null);
    if (!amountOk || amountUsd == null) {
      setError(
        `Enter an amount from ${formatUsd(MIN_AMOUNT_USD)} to ${formatUsd(MAX_AMOUNT_USD)}.`,
      );
      return;
    }
    if (!walletOk) {
      setError("Enter a valid wallet address (0x + 40 hex).");
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
    clearInstantSession();
    setInstant(null);
    setCardSecret(null);
    setPaidAmount(null);
    setResumePaid(false);
    setStatus("");
    setError(null);
    setMode("pick");
  }

  if (mode === "instant" && paidAmount != null && instant) {
    return (
      <>
        {status ? <p className="form-hint">{status}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        <InstantCompleteCheckout
          amountUsd={paidAmount}
          amountLabel={formatUsd(paidAmount)}
          network={network}
          walletAddress={normalizedWallet || wallet.trim()}
          sessionId={instant.id}
          payUrl={instant.url}
          resumePaid={resumePaid}
          onPaid={() =>
            setStatus("Paid — crypto is settling to your wallet.")
          }
          onFailed={(message) => setError(message)}
          onCancel={resetToPick}
        />
      </>
    );
  }

  if (mode === "card" && paidAmount != null && cardSecret && stripePromise) {
    return (
      <div className="payment-stack onramp-focus">
        <div className="destination-summary">
          <p>
            Card backup <strong>{formatUsd(paidAmount)}</strong> → crypto later
            to <code className="break">{wallet.trim()}</code> on {network}
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
          Instant: pay with card, crypto goes to your wallet. Card backup is
          slower.
        </p>

        <div
          className="amount-chips path-chips"
          role="group"
          aria-label="Pay method"
        >
          <button
            type="button"
            className={path === "instant" ? "amount-chip active" : "amount-chip"}
            onClick={() => setPath("instant")}
            disabled={!instantReady}
          >
            Instant
          </button>
          <button
            type="button"
            className={path === "card" ? "amount-chip active" : "amount-chip"}
            onClick={() => setPath("card")}
          >
            Card backup
          </button>
        </div>

        {!instantReady ? (
          <p className="form-hint">
            Instant is finishing setup — use Card backup for now.
          </p>
        ) : null}

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
            inputMode="decimal"
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
              setNetwork(e.target.value as ThirdwebInstantNetworkId)
            }
          >
            {THIRDWEB_INSTANT_NETWORKS.map((n) => (
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
            placeholder="0x…"
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </label>
        {walletDirty && !walletOk ? (
          <p className="form-error">Enter a valid wallet (0x + 40 hex).</p>
        ) : null}

        <label className="field">
          Email (optional)
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

        <button
          type="button"
          className="primary-cta"
          onClick={startPay}
          disabled={loading || !canStart}
        >
          {loading
            ? "Opening…"
            : path === "card"
              ? `Card backup ${amountOk ? amountLabel : rangeLabel}`
              : `Buy crypto ${amountOk ? amountLabel : rangeLabel}`}
        </button>
        <p className="form-hint">
          {path === "card"
            ? "Card backup pays on this page; crypto is sent later."
            : "After you pay, crypto settles to your wallet."}
        </p>
      </div>
    </div>
  );
}
