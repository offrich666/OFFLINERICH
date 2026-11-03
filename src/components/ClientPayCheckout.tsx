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
  const [path, setPath] = useState<PayPath>("instant");
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
          markDone(
            data.status === "fulfillment_processing"
              ? "Payment received — crypto delivery finishing…"
              : "Payment complete — crypto is on the way to your wallet.",
          );
          return true;
        }
        setStatus(
          data.status === "requires_payment"
            ? "Checkout still open — continue payment, then come back here."
            : data.status === "rejected"
              ? "This checkout was declined. Start a new payment."
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
    if (!publishableKey) {
      setError("Checkout is not configured. Try again later.");
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
      const data = (await res.json()) as {
        clientSecret?: string;
        sessionId?: string;
        redirectUrl?: string | null;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Could not start crypto checkout");
      }
      if (!data.redirectUrl) {
        throw new Error(
          "Secure checkout URL missing. Refresh and try Instant crypto again.",
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
      setStatus("Opening secure checkout…");
      window.location.assign(data.redirectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed to start");
    } finally {
      setLoading(false);
    }
  }

  function resetToPick() {
    stopStatusPoll();
    cardRequestRef.current = null;
    cardSecretPromiseRef.current = null;
    setCardReady(false);
    setPaidAmount(null);
    setPending(null);
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
          <h2>Opening checkout…</h2>
          <p>
            Taking you to the secure payment page. Device verify works there —
            this site will not reload the form underneath. After you pay, come
            back to this tab or reopen{" "}
            <a href="/checkout">/checkout</a>.
          </p>
          {status ? <p className="form-hint">{status}</p> : null}
          {pending?.redirectUrl ? (
            <p className="form-hint">
              If nothing opens,{" "}
              <a href={pending.redirectUrl}>continue to checkout</a>.
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
              <>You have a crypto checkout in progress.</>
            )}
          </p>
          {status ? <p className="form-hint">{status}</p> : null}
          <div className="cta-row" style={{ marginTop: "1rem", gap: "0.75rem" }}>
            {pending?.redirectUrl ? (
              <a className="primary-cta" href={pending.redirectUrl}>
                Continue secure checkout
              </a>
            ) : null}
            {pending?.sessionId ? (
              <button
                type="button"
                className="primary-cta"
                disabled={checkingStatus}
                onClick={() => void checkPendingStatus(pending.sessionId!)}
              >
                {checkingStatus ? "Checking…" : "I finished paying"}
              </button>
            ) : (
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
            )}
            <button type="button" className="ghost-link" onClick={resetToPick}>
              Start over
            </button>
          </div>
          <p className="fineprint">
            Prefer email code if device verify loops. We never remount the
            payment form under you.
          </p>
        </div>
      </div>
    );
  }

  if (mode === "card" && paidAmount != null && cardReady && stripePromise) {
    return (
      <div className="payment-stack onramp-focus">
        <div className="destination-summary">
          <p>
            Crossmint card · <strong>{formatUsd(paidAmount)}</strong> →{" "}
            <code className="break">{wallet.trim()}</code>
          </p>
          <button type="button" className="ghost-link" onClick={resetToPick}>
            Change details
          </button>
        </div>
        <p className="form-hint">
          Pay with card / Apple Pay / Google Pay via Crossmint. No crypto
          identity check. After payment clears, we send crypto to your wallet.
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
          Enter your wallet and amount. Checkout is powered by Crossmint —
          instant crypto or easy card.
        </p>

        <div className="amount-chips path-chips" role="group" aria-label="Pay method">
          <button
            type="button"
            className={path === "instant" ? "amount-chip active" : "amount-chip"}
            onClick={() => setPath("instant")}
          >
            Instant crypto
          </button>
          <button
            type="button"
            className={path === "easy" ? "amount-chip active" : "amount-chip"}
            onClick={() => setPath("easy")}
          >
            Easy card (USD)
          </button>
        </div>
        <p className="form-hint">
          {path === "instant"
            ? "Opens secure checkout in one step (no mid-verify reload). Crypto goes to your wallet."
            : "Card only — no crypto KYC. Pays USD to us; crypto is sent later only after treasury is funded."}
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
          Email (optional — speeds checkout)
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>

        {error ? <p className="form-error">{error}</p> : null}

        <button
          type="button"
          className="primary-cta"
          onClick={startPay}
          disabled={loading || !canStart}
        >
          {loading
            ? "Starting…"
            : path === "instant"
              ? `Continue to crypto ${amountOk ? amountLabel : rangeLabel}`
              : `Continue with card ${amountOk ? amountLabel : rangeLabel}`}
        </button>
      </div>
    </div>
  );
}
