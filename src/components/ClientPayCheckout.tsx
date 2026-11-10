"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { ThirdwebInstantEmbed } from "@/components/ThirdwebInstantEmbed";
import {
  MAX_AMOUNT_USD,
  MIN_AMOUNT_USD,
  checkoutAmountRangeLabel,
  formatUsd,
  isOnrampClientNetwork,
  isValidAmountUsd,
  isValidWalletAddress,
  normalizeWalletAddress,
  parseAmountUsd,
} from "@/lib/networks";
import {
  THIRDWEB_INSTANT_NETWORKS,
  getThirdwebClientId,
  isThirdwebInstantNetwork,
  type ThirdwebInstantNetworkId,
} from "@/lib/thirdwebPublic";
import { getStripePublishableKey } from "@/lib/stripePublic";

const publishableKey = getStripePublishableKey();
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;
const stripeOnrampReady = Boolean(publishableKey);
const thirdwebReady = Boolean(getThirdwebClientId());
const QUICK_AMOUNTS = [5, 10, 25, 50, 100, 250, 500, 1000, 5000, 10000] as const;
const ONRAMP_PENDING_KEY = "offlinerich.crossmint_onramp.pending.v2";

type PendingOnramp = {
  sessionId: string;
  redirectUrl?: string;
  amountUsd: number;
  wallet: string;
};

type PayPath = "instant" | "crossmint" | "crossmintOnramp" | "card";
type Mode = "pick" | "instant" | "crossmintOnramp" | "card" | "returning";

/**
 * Instant = thirdweb buy-widget on-page.
 * Buy with Crossmint Business B2C = opens Paybis buy flow.
 * Crossmint Onramp = Stripe Crypto Onramp hosted Link Pay (embed Instant Pay is broken).
 * Card = Stripe Embedded Checkout backup.
 */
export function ClientPayCheckout() {
  const rangeLabel = checkoutAmountRangeLabel();
  const [path, setPath] = useState<PayPath>(
    thirdwebReady ? "instant" : "card",
  );
  const [amountInput, setAmountInput] = useState(String(MIN_AMOUNT_USD));
  const [email, setEmail] = useState("");
  const [network, setNetwork] = useState<ThirdwebInstantNetworkId>("ethereum");
  const [wallet, setWallet] = useState("");
  const [mode, setMode] = useState<Mode>("pick");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paidAmount, setPaidAmount] = useState<number | null>(null);
  const [cardSecret, setCardSecret] = useState<string | null>(null);
  const [pendingOnramp, setPendingOnramp] = useState<PendingOnramp | null>(
    null,
  );
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopStatusPoll = useCallback(() => {
    if (statusPollRef.current) {
      clearInterval(statusPollRef.current);
      statusPollRef.current = null;
    }
  }, []);

  const resumeFromPending = useCallback(() => {
    try {
      const raw = sessionStorage.getItem(ONRAMP_PENDING_KEY);
      if (!raw) return false;
      const next = JSON.parse(raw) as PendingOnramp;
      if (!next?.sessionId || !next.amountUsd || !next.wallet) return false;
      setPendingOnramp(next);
      setPaidAmount(next.amountUsd);
      setWallet(next.wallet);
      setNetwork("ethereum");
      setPath("crossmintOnramp");
      setMode("returning");
      setStatus("Checking whether your Crossmint Onramp payment finished…");
      setError(null);
      return true;
    } catch {
      sessionStorage.removeItem(ONRAMP_PENDING_KEY);
      return false;
    }
  }, []);

  // Resume after hosted Link Pay returns (or browser Back / bfcache).
  useEffect(() => {
    resumeFromPending();
  }, [resumeFromPending]);

  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) resumeFromPending();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [resumeFromPending]);

  // Poll Stripe session after return from crypto.link.com.
  useEffect(() => {
    if (mode !== "returning" || !pendingOnramp?.sessionId) return;
    let cancelled = false;

    async function pollOnce() {
      try {
        const res = await fetch(
          `/api/onramp/session-status?sessionId=${encodeURIComponent(pendingOnramp!.sessionId)}`,
        );
        const data = (await res.json()) as {
          status?: string;
          complete?: boolean;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "Could not check payment status");
          return;
        }
        if (data.complete) {
          stopStatusPoll();
          try {
            sessionStorage.removeItem(ONRAMP_PENDING_KEY);
          } catch {
            /* ignore */
          }
          setStatus("Paid — crypto is settling to your wallet.");
          setError(null);
          return;
        }
        if (data.status === "rejected") {
          stopStatusPoll();
          setError("This Onramp session was rejected. Start again or use Card backup.");
          setStatus("");
          return;
        }
        if (data.status === "requires_payment") {
          setStatus(
            "Welcome back — finish paying in Link, or use card on this page.",
          );
        } else if (data.status === "initialized") {
          setStatus("Session ready — reopen Link Pay to continue.");
        } else if (data.status) {
          setStatus(`Status: ${data.status}`);
        }
      } catch {
        if (!cancelled) setError("Could not check payment status");
      }
    }

    void pollOnce();
    statusPollRef.current = setInterval(() => {
      void pollOnce();
    }, 4000);
    return () => {
      cancelled = true;
      stopStatusPoll();
    };
  }, [mode, pendingOnramp, stopStatusPoll]);

  const amountUsd = parseAmountUsd(amountInput);
  const amountOk = amountUsd != null && isValidAmountUsd(amountUsd);
  const amountLabel = amountOk ? formatUsd(amountUsd!) : rangeLabel;
  const onrampNetwork = isOnrampClientNetwork(network) ? network : "ethereum";
  const walletNetwork = path === "crossmintOnramp" ? onrampNetwork : network;
  const normalizedWallet = normalizeWalletAddress(walletNetwork, wallet);
  const walletOk = isValidWalletAddress(walletNetwork, wallet);
  const walletDirty = wallet.trim().length > 0;
  const emailTrimmed = email.trim();
  const emailOk =
    !emailTrimmed || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed);

  const canStart =
    amountOk &&
    walletOk &&
    emailOk &&
    (path === "instant"
      ? thirdwebReady
      : path === "crossmint"
        ? true
        : path === "crossmintOnramp"
          ? stripeOnrampReady
          : Boolean(publishableKey));

  useEffect(() => {
    if (path === "crossmintOnramp" && network !== "ethereum") {
      setNetwork("ethereum");
    }
  }, [path, network]);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "onramp-active",
      mode === "instant" ||
        mode === "crossmintOnramp" ||
        mode === "card" ||
        mode === "returning",
    );
    return () => document.documentElement.classList.remove("onramp-active");
  }, [mode]);

  function startInstant() {
    if (!thirdwebReady) throw new Error("Instant is not configured yet.");
    if (!isThirdwebInstantNetwork(network)) {
      throw new Error("Choose Ethereum, Polygon, Base, or BNB Chain.");
    }
    setWallet(normalizedWallet);
    setPaidAmount(amountUsd!);
    setMode("instant");
    setStatus("");
  }

  /** Crossmint Business B2C chip → open Paybis buy (works now). */
  async function startCrossmintB2CPaybis() {
    if (!isThirdwebInstantNetwork(network)) {
      throw new Error("Choose Ethereum, Polygon, Base, or BNB Chain.");
    }
    const res = await fetch("/api/onramp/paybis/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amountUsd,
        network,
        wallet: normalizedWallet,
        email: emailTrimmed || undefined,
        mode: "redirect",
      }),
    });
    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !data.url) {
      throw new Error(data.error || "Could not open Paybis");
    }
    window.location.assign(data.url);
  }

  async function startCrossmintOnramp() {
    if (!stripeOnrampReady) {
      throw new Error("Crossmint Onramp is not configured yet.");
    }
    const res = await fetch("/api/onramp/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amountUsd,
        email: emailTrimmed || undefined,
        network: "ethereum",
        wallet: normalizedWallet,
      }),
    });
    const data = (await res.json()) as {
      clientSecret?: string;
      redirectUrl?: string;
      sessionId?: string;
      error?: string;
    };
    if (!res.ok || !data.redirectUrl || !data.sessionId) {
      throw new Error(data.error || "Could not start Crossmint Onramp");
    }
    const pending: PendingOnramp = {
      sessionId: data.sessionId,
      redirectUrl: data.redirectUrl,
      amountUsd: amountUsd!,
      wallet: normalizedWallet,
    };
    try {
      sessionStorage.setItem(ONRAMP_PENDING_KEY, JSON.stringify(pending));
    } catch {
      /* ignore quota */
    }
    setPendingOnramp(pending);
    setPaidAmount(amountUsd!);
    setWallet(normalizedWallet);
    setNetwork("ethereum");
    setMode("returning");
    setStatus("Opening Link Pay…");
    // Hosted Link Pay — embed Instant Pay fails with "Failed to start payment process".
    window.location.assign(data.redirectUrl);
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
        email: emailTrimmed || undefined,
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
      else if (path === "crossmint") await startCrossmintB2CPaybis();
      else if (path === "crossmintOnramp") await startCrossmintOnramp();
      else startInstant();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed to start");
      setMode("pick");
    } finally {
      setLoading(false);
    }
  }

  function resetToPick() {
    stopStatusPoll();
    try {
      sessionStorage.removeItem(ONRAMP_PENDING_KEY);
    } catch {
      /* ignore */
    }
    setCardSecret(null);
    setPendingOnramp(null);
    setPaidAmount(null);
    setStatus("");
    setError(null);
    setMode("pick");
  }

  async function reopenHostedLinkPay() {
    if (!pendingOnramp?.redirectUrl) {
      setError("Session expired — start Crossmint Onramp again.");
      return;
    }
    setStatus("Reopening Link Pay…");
    window.location.assign(pendingOnramp.redirectUrl);
  }

  async function fallbackToCardFromOnramp() {
    setError(null);
    setLoading(true);
    try {
      // Reuse amount/wallet already locked in for this Onramp attempt.
      if (paidAmount == null) throw new Error("Missing amount");
      const res = await fetch("/api/checkout/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountUsd: paidAmount,
          email: emailTrimmed || undefined,
          network: "ethereum",
          wallet: normalizeWalletAddress("ethereum", wallet) || wallet.trim(),
        }),
      });
      const data = (await res.json()) as {
        clientSecret?: string;
        error?: string;
      };
      if (!res.ok || !data.clientSecret) {
        throw new Error(data.error || "Could not start card checkout");
      }
      stopStatusPoll();
      setCardSecret(data.clientSecret);
      setMode("card");
      setStatus(
        "Card backup: pay here — crypto is sent after payment (not Instant).",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Card checkout failed");
    } finally {
      setLoading(false);
    }
  }

  if (mode === "instant" && paidAmount != null) {
    return (
      <div className="payment-stack onramp-focus">
        <div className="destination-summary">
          <p>
            Instant <strong>{formatUsd(paidAmount)}</strong> → crypto to{" "}
            <code className="break">{wallet.trim()}</code> on {network}
          </p>
          <button type="button" className="ghost-link" onClick={resetToPick}>
            Change details
          </button>
        </div>
        {status ? <p className="form-hint">{status}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        <ThirdwebInstantEmbed
          amountUsd={paidAmount}
          network={network}
          walletAddress={normalizedWallet || wallet.trim()}
          onPaid={() => setStatus("Paid — crypto is settling to your wallet.")}
          onFailed={(message) => setError(message)}
        />
      </div>
    );
  }

  if (mode === "returning" && paidAmount != null) {
    return (
      <div className="payment-stack onramp-focus">
        <div className="destination-summary">
          <p>
            Crossmint Onramp <strong>{formatUsd(paidAmount)}</strong> → crypto
            to <code className="break">{wallet.trim()}</code> on ethereum
          </p>
          <button type="button" className="ghost-link" onClick={resetToPick}>
            Change details
          </button>
        </div>
        {status ? <p className="form-hint">{status}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        <div className="setup-panel soft">
          <p className="form-hint">
            Link Pay opens on Stripe to finish card → USDC. The on-page Instant
            Pay step was failing with &quot;Failed to start payment process.&quot;
          </p>
          <div className="instant-complete-actions">
            <button
              type="button"
              className="primary-cta"
              onClick={reopenHostedLinkPay}
              disabled={!pendingOnramp?.redirectUrl || loading}
            >
              Open Link Pay
            </button>
            <button
              type="button"
              className="ghost-link"
              onClick={fallbackToCardFromOnramp}
              disabled={loading}
            >
              {loading ? "Opening card…" : "Pay with card on this page instead"}
            </button>
          </div>
        </div>
      </div>
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
          Instant and Crossmint Onramp stay on this page. Crossmint Business B2C
          opens Paybis to buy.
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
            disabled={!thirdwebReady}
          >
            Instant
          </button>
          <button
            type="button"
            className={
              path === "crossmint"
                ? "amount-chip crossmint-path active"
                : "amount-chip crossmint-path"
            }
            onClick={() => setPath("crossmint")}
          >
            Buy with Crossmint Business B2C
          </button>
          <button
            type="button"
            className={
              path === "crossmintOnramp" ? "amount-chip active" : "amount-chip"
            }
            onClick={() => setPath("crossmintOnramp")}
            disabled={!stripeOnrampReady}
          >
            Crossmint Onramp
          </button>
          <button
            type="button"
            className={path === "card" ? "amount-chip active" : "amount-chip"}
            onClick={() => setPath("card")}
          >
            Card backup
          </button>
        </div>

        {path === "crossmint" ? (
          <p className="form-hint">
            Opens Paybis so you can buy crypto there with card.
          </p>
        ) : null}

        {path === "crossmintOnramp" ? (
          <p className="form-hint">
            Crossmint Onramp opens Stripe Link Pay for Ethereum USDC (avoids the
            broken on-page Instant Pay step).
          </p>
        ) : null}

        {!thirdwebReady ? (
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
            value={path === "crossmintOnramp" ? "ethereum" : network}
            onChange={(e) =>
              setNetwork(e.target.value as ThirdwebInstantNetworkId)
            }
            disabled={path === "crossmintOnramp"}
          >
            {path === "crossmintOnramp" ? (
              <option value="ethereum">Ethereum (USDC)</option>
            ) : (
              THIRDWEB_INSTANT_NETWORKS.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label} ({n.asset})
                </option>
              ))
            )}
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
        {emailTrimmed && !emailOk ? (
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
              : path === "crossmint"
                ? `Open Paybis ${amountOk ? amountLabel : rangeLabel}`
                : path === "crossmintOnramp"
                  ? `Crossmint Onramp ${amountOk ? amountLabel : rangeLabel}`
                  : `Buy crypto ${amountOk ? amountLabel : rangeLabel}`}
        </button>
        <p className="form-hint">
          {path === "card"
            ? "Card backup pays on this page; crypto is sent later."
            : path === "crossmint"
              ? "Opens Paybis — pay with card there; crypto goes to your wallet."
              : path === "crossmintOnramp"
                ? "Opens Stripe Link Pay — card → USDC to your wallet. You return here when done."
                : "Instant stays on this page. Crypto goes to your wallet when payment completes."}
        </p>
      </div>
    </div>
  );
}
