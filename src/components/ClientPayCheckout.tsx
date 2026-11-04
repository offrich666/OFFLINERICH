"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import {
  CLIENT_NETWORKS,
  ONRAMP_CLIENT_NETWORKS,
  MAX_AMOUNT_USD,
  MIN_AMOUNT_USD,
  checkoutAmountRangeLabel,
  formatUsd,
  isValidAmountUsd,
  isValidWalletAddress,
  normalizeWalletAddress,
  parseAmountUsd,
  type ClientNetworkId,
  type OnrampClientNetworkId,
} from "@/lib/networks";
import { getStripePublishableKey } from "@/lib/stripePublic";

const publishableKey = getStripePublishableKey();
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;
const QUICK_AMOUNTS = [5, 10, 25, 50, 100, 250, 500, 1000] as const;
const PENDING_KEY = "offlinerich_onramp_pending";

type PayPath = "easy" | "instant";
type Mode = "pick" | "card" | "redirecting" | "returning" | "done";

type PendingOnramp = {
  sessionId?: string;
  wallet?: string;
  network?: ClientNetworkId;
  amountUsd?: number;
  redirectUrl?: string;
};

/**
 * Instant crypto uses Stripe's hosted Link page only (full-page redirect).
 * Embedded iframes remount mid–device-verify and loop forever — never embed Instant.
 */
export function ClientPayCheckout() {
  const rangeLabel = checkoutAmountRangeLabel();
  // Card is default: Instant crypto often fails at final bank auth (crypto MCC).
  const [path, setPath] = useState<PayPath>("easy");
  const [amountInput, setAmountInput] = useState(String(MIN_AMOUNT_USD));
  const [email, setEmail] = useState("");
  const [network, setNetwork] = useState<ClientNetworkId>("ethereum");
  const [wallet, setWallet] = useState("");
  const [mode, setMode] = useState<Mode>("pick");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paidAmount, setPaidAmount] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingOnramp | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [instantDeclined, setInstantDeclined] = useState(false);
  const cardRequestRef = useRef<{
    amountUsd: number;
    email?: string;
    network: string;
    wallet: string;
  } | null>(null);
  const cardSecretPromiseRef = useRef<Promise<string> | null>(null);
  const [cardReady, setCardReady] = useState(false);
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const amountUsd = parseAmountUsd(amountInput);
  const amountOk = amountUsd != null && isValidAmountUsd(amountUsd);
  const amountLabel = amountOk ? formatUsd(amountUsd!) : rangeLabel;
  const networks =
    path === "instant" ? ONRAMP_CLIENT_NETWORKS : CLIENT_NETWORKS;
  const normalizedWallet = normalizeWalletAddress(network, wallet);
  const walletOk = isValidWalletAddress(network, wallet);
  const walletDirty = wallet.trim().length > 0;
  const canStart = amountOk && walletOk;

  useEffect(() => {
    if (path === "instant" && !ONRAMP_CLIENT_NETWORKS.some((n) => n.id === network)) {
      setNetwork("ethereum");
    }
  }, [path, network]);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "onramp-active",
      mode === "card" || mode === "redirecting" || mode === "returning",
    );
    return () => document.documentElement.classList.remove("onramp-active");
  }, [mode]);

  const resumeFromPending = useCallback(() => {
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      if (!raw) return false;
      const next = JSON.parse(raw) as PendingOnramp;
      if (!next.sessionId && !next.wallet) return false;
      setPending(next);
      if (next.wallet) setWallet(next.wallet);
      if (next.network) setNetwork(next.network);
      if (next.amountUsd) setPaidAmount(next.amountUsd);
      setMode("returning");
      setStatus("Checking whether your payment finished…");
      return true;
    } catch {
      return false;
    }
  }, []);

  // Resume after hosted Link (buyer comes back to /checkout — no embed remount).
  useEffect(() => {
    resumeFromPending();
  }, [resumeFromPending]);

  // Browser Back from crypto.link.com often restores bfcache on "redirecting".
  // Flip to the resume panel instead of leaving them stuck on "Opening…".
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) resumeFromPending();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [resumeFromPending]);

  const stopStatusPoll = useCallback(() => {
    if (statusPollRef.current) {
      clearInterval(statusPollRef.current);
      statusPollRef.current = null;
    }
  }, []);

  const markDone = useCallback((message?: string) => {
    stopStatusPoll();
    try {
      sessionStorage.removeItem(PENDING_KEY);
    } catch {
      /* ignore */
    }
    setPending(null);
    setStatus(
      message || "Payment complete — crypto is on the way to your wallet.",
    );
    setMode("done");
  }, [stopStatusPoll]);

  const checkPendingStatus = useCallback(
    async (sessionId: string) => {
      setCheckingStatus(true);
      try {
        const res = await fetch(
          `/api/onramp/session-status?sessionId=${encodeURIComponent(sessionId)}`,
        );
        const data = (await res.json()) as {
          status?: string;
          complete?: boolean;
          error?: string;
        };
        if (!res.ok) {
          setStatus(
            data.error ||
              "Could not confirm yet — if you already paid, check your wallet.",
          );
          return false;
        }
        if (data.complete) {
          setInstantDeclined(false);
          markDone(
            data.status === "fulfillment_processing"
              ? "Payment received — crypto delivery finishing…"
              : "Payment complete — crypto is on the way to your wallet.",
          );
          return true;
        }
        if (data.status === "rejected") {
          setInstantDeclined(true);
          setStatus(
            "Your bank declined the crypto charge at the end. Use Card instead — same wallet, different payment rail.",
          );
          return false;
        }
        setInstantDeclined(false);
        setStatus(
          data.status === "requires_payment"
            ? "Checkout still open — if the bank declined at the end, come back and use Card."
            : `Status: ${data.status || "pending"}. Finish on the secure page, then refresh here.`,
        );
        return false;
      } catch {
        setStatus("Could not confirm yet — if you already paid, check your wallet.");
        return false;
      } finally {
        setCheckingStatus(false);
      }
    },
    [markDone],
  );

  useEffect(() => {
    if (mode !== "returning" || !pending?.sessionId) return;
    let cancelled = false;
    (async () => {
      const done = await checkPendingStatus(pending.sessionId!);
      if (cancelled || done) return;
      stopStatusPoll();
      statusPollRef.current = setInterval(() => {
        void checkPendingStatus(pending.sessionId!);
      }, 8000);
    })();
    return () => {
      cancelled = true;
      stopStatusPoll();
    };
  }, [mode, pending?.sessionId, checkPendingStatus, stopStatusPoll]);

  const fetchCardClientSecret = useCallback(async () => {
    if (!cardSecretPromiseRef.current) {
      const req = cardRequestRef.current;
      if (!req) throw new Error("Card checkout not ready");
      cardSecretPromiseRef.current = (async () => {
        const res = await fetch("/api/checkout/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req),
        });
        const data = (await res.json()) as {
          clientSecret?: string;
          error?: string;
        };
        if (!res.ok || !data.clientSecret) {
          throw new Error(data.error || "Could not start card checkout");
        }
        return data.clientSecret;
      })();
    }
    return cardSecretPromiseRef.current;
  }, []);

  const cardOptions = useMemo(
    () => ({ fetchClientSecret: fetchCardClientSecret }),
    [fetchCardClientSecret],
  );

  async function startPay() {
    setError(null);
    setStatus("");
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
          : "Enter a valid wallet address (0x + 40 hex).",
      );
      return;
    }
    // Card embed needs the publishable key; Instant only redirects to hosted checkout.
    if (path === "easy" && !publishableKey) {
      setError("Card checkout is not configured. Try Crypto, or refresh later.");
      return;
    }

    setLoading(true);
    try {
      if (path === "easy") {
        cardRequestRef.current = {
          amountUsd,
          email: email.trim() || undefined,
          network,
          wallet: normalizedWallet,
        };
        cardSecretPromiseRef.current = null;
        setWallet(normalizedWallet);
        setCardReady(true);
        setPaidAmount(amountUsd);
        setMode("card");
        return;
      }

      if (!ONRAMP_CLIENT_NETWORKS.some((n) => n.id === network)) {
        throw new Error("Instant crypto supports Ethereum or Bitcoin only");
      }
      const res = await fetch("/api/onramp/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountUsd,
          email: email.trim() || undefined,
          network: network as OnrampClientNetworkId,
          wallet: normalizedWallet,
        }),
      });
      let data: {
        clientSecret?: string;
        sessionId?: string;
        redirectUrl?: string | null;
        error?: string;
        code?: string;
      };
      try {
        data = (await res.json()) as typeof data;
      } catch {
        throw new Error(
          "Could not reach checkout. Check your connection and try again, or use Card.",
        );
      }
      if (!res.ok) {
        throw new Error(
          data.error ||
            "Could not start crypto checkout. Try the Card option instead.",
        );
      }
      if (!data.redirectUrl) {
        throw new Error(
          "Secure checkout URL missing. Refresh, or pay with Card instead.",
        );
      }

      setWallet(normalizedWallet);
      setPaidAmount(amountUsd);

      const nextPending: PendingOnramp = {
        sessionId: data.sessionId,
        wallet: normalizedWallet,
        network,
        amountUsd,
        redirectUrl: data.redirectUrl,
      };
      try {
        sessionStorage.setItem(PENDING_KEY, JSON.stringify(nextPending));
      } catch {
        /* ignore */
      }
      setPending(nextPending);

      // Full navigation to hosted Link — device verify works there (no iframe remount).
      setMode("redirecting");
      setStatus("Opening payment…");
      window.location.assign(data.redirectUrl);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Payment failed to start";
      setError(message);
      // Instant crypto often blocked by banks / region — Card is the fallback form.
      if (path === "instant") {
        setStatus("Crypto checkout could not start. You can pay with Card instead.");
      }
    } finally {
      setLoading(false);
    }
  }

  /** Open the embedded Card form when Instant crypto fails (start or final bank decline). */
  function openCardFallback() {
    const payAmount =
      (amountOk && amountUsd != null ? amountUsd : null) ??
      paidAmount ??
      pending?.amountUsd ??
      null;
    const payWallet = normalizedWallet || pending?.wallet || wallet.trim();
    const payNetwork = (pending?.network || network) as ClientNetworkId;
    const walletReady = isValidWalletAddress(payNetwork, payWallet);

    if (payAmount == null || !isValidAmountUsd(payAmount) || !walletReady) {
      setError("Enter amount and wallet first, then try Card.");
      setMode("pick");
      setPath("easy");
      return;
    }
    if (!publishableKey) {
      setError("Card checkout is not configured. Try again later.");
      setMode("pick");
      setPath("easy");
      return;
    }
    stopStatusPoll();
    setInstantDeclined(false);
    setError(null);
    setStatus("");
    setPath("easy");
    setNetwork(payNetwork);
    setWallet(payWallet);
    setAmountInput(String(payAmount));
    cardRequestRef.current = {
      amountUsd: payAmount,
      email: email.trim() || undefined,
      network: payNetwork,
      wallet: normalizeWalletAddress(payNetwork, payWallet),
    };
    cardSecretPromiseRef.current = null;
    setCardReady(true);
    setPaidAmount(payAmount);
    setMode("card");
  }

  function resetToPick() {
    stopStatusPoll();
    cardRequestRef.current = null;
    cardSecretPromiseRef.current = null;
    setCardReady(false);
    setPaidAmount(null);
    setPending(null);
    setInstantDeclined(false);
    setStatus("");
    setError(null);
    setMode("pick");
    try {
      sessionStorage.removeItem(PENDING_KEY);
    } catch {
      /* ignore */
    }
  }

  if (mode === "done") {
    return (
      <div className="payment-stack client-pay">
        <div className="setup-panel soft">
          <h2>You’re set</h2>
          <p>
            Payment received
            {paidAmount ? ` (${formatUsd(paidAmount)})` : ""}. Crypto goes to{" "}
            <code className="break">{wallet.trim()}</code> on {network}.
          </p>
          {status ? <p className="form-hint">{status}</p> : null}
          <button type="button" className="ghost-link" onClick={resetToPick}>
            New payment
          </button>
        </div>
      </div>
    );
  }

  if (mode === "redirecting") {
    return (
      <div className="payment-stack client-pay">
        <div className="setup-panel soft">
          <h2>Opening payment…</h2>
          <p>
            Continue on the secure payment page. When you’re done, return here
            or reopen Pay.
          </p>
          {status ? <p className="form-hint">{status}</p> : null}
          {pending?.redirectUrl ? (
            <p className="form-hint">
              If nothing opens,{" "}
              <a href={pending.redirectUrl}>continue to pay</a>.
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (mode === "returning") {
    return (
      <div className="payment-stack client-pay">
        <div className="setup-panel soft">
          <h2>Welcome back</h2>
          <p>
            {paidAmount ? (
              <>
                You started <strong>{formatUsd(paidAmount)}</strong> to{" "}
                <code className="break">{wallet.trim()}</code> on {network}.
              </>
            ) : (
              <>You have a payment in progress.</>
            )}
          </p>
          {status ? (
            <p className={instantDeclined ? "form-error" : "form-hint"}>
              {status}
            </p>
          ) : null}
          <div className="cta-row" style={{ marginTop: "1rem", gap: "0.75rem" }}>
            {instantDeclined || /declin/i.test(status) ? (
              <button
                type="button"
                className="primary-cta"
                onClick={openCardFallback}
                disabled={!walletOk || paidAmount == null}
              >
                Open Card payment form
              </button>
            ) : null}
            {!instantDeclined && pending?.redirectUrl ? (
              <a className="primary-cta" href={pending.redirectUrl}>
                Continue payment
              </a>
            ) : null}
            {!instantDeclined && pending?.sessionId ? (
              <button
                type="button"
                className="primary-cta"
                disabled={checkingStatus}
                onClick={() => void checkPendingStatus(pending.sessionId!)}
              >
                {checkingStatus ? "Checking…" : "I finished paying"}
              </button>
            ) : null}
            {!instantDeclined && !pending?.sessionId ? (
              <button
                type="button"
                className="primary-cta"
                onClick={() =>
                  markDone(
                    "If payment went through, crypto is on the way to your wallet.",
                  )
                }
              >
                I finished paying
              </button>
            ) : null}
            <button type="button" className="ghost-link" onClick={resetToPick}>
              Start over
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "card" && paidAmount != null && cardReady && stripePromise) {
    return (
      <div className="payment-stack onramp-focus">
        <div className="destination-summary">
          <p>
            Pay <strong>{formatUsd(paidAmount)}</strong> →{" "}
            <code className="break">{wallet.trim()}</code>
          </p>
          <button type="button" className="ghost-link" onClick={resetToPick}>
            Change details
          </button>
        </div>
        <p className="form-hint">
          Pay with card, Apple Pay, or Google Pay. We’ll send crypto to your
          wallet after payment clears.
        </p>
        <div className="stripe-embed">
          <EmbeddedCheckoutProvider
            key={`${paidAmount}-${wallet.trim()}`}
            stripe={stripePromise}
            options={cardOptions}
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
        <h2>Pay</h2>
        <p>
          Enter amount and wallet, then pay. Prefer <strong>Card</strong> —
          Instant crypto often fails at the last bank step.
        </p>

        <div className="amount-chips path-chips" role="group" aria-label="Pay method">
          <button
            type="button"
            className={path === "easy" ? "amount-chip active" : "amount-chip"}
            onClick={() => setPath("easy")}
          >
            Card
          </button>
          <button
            type="button"
            className={path === "instant" ? "amount-chip active" : "amount-chip"}
            onClick={() => setPath("instant")}
          >
            Instant crypto
          </button>
        </div>
        <p className="form-hint">
          {path === "easy"
            ? "Best success rate. Card form on this page; crypto is sent after payment clears."
            : "Crypto goes straight to your wallet — many banks decline this at the final charge. If that happens, use Card."}
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
            placeholder={network === "bitcoin" ? "bc1…" : "0x…"}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {walletDirty && !walletOk ? (
          <p className="form-error">
            {network === "bitcoin"
              ? "Enter a valid Bitcoin address (bc1… / 1… / 3…)."
              : "Enter a valid wallet (0x + 40 hex characters)."}
          </p>
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

        {error ? <p className="form-error">{error}</p> : null}
        {status && path === "instant" && error ? (
          <p className="form-hint">{status}</p>
        ) : null}

        <button
          type="button"
          className="primary-cta"
          onClick={startPay}
          disabled={loading || !canStart}
        >
          {loading
            ? "Starting…"
            : `Pay ${amountOk ? amountLabel : rangeLabel}`}
        </button>

        {error && path === "instant" ? (
          <button
            type="button"
            className="primary-cta"
            style={{ marginTop: "0.75rem" }}
            onClick={openCardFallback}
            disabled={!canStart || loading}
          >
            Open Card payment form
          </button>
        ) : null}
      </div>
    </div>
  );
}
