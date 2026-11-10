"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  amountUsd: number;
  amountLabel: string;
  network: string;
  walletAddress: string;
  sessionId: string;
  payUrl: string;
  onPaid: () => void;
  onFailed: (message: string) => void;
  onCancel: () => void;
  /** Resume after mobile return from payment provider */
  resumePaid?: boolean;
};

const DONE = new Set([
  "completed",
  "complete",
  "success",
  "successful",
  "fulfilled",
  "fulfillment_complete",
  "pending_delivery",
]);

const STORAGE_KEY = "or_instant_session";

export type SavedInstantSession = {
  id: string;
  url: string;
  amountUsd: number;
  amountLabel: string;
  network: string;
  walletAddress: string;
};

export function saveInstantSession(session: SavedInstantSession) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

export function loadInstantSession(): SavedInstantSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedInstantSession;
  } catch {
    return null;
  }
}

export function clearInstantSession() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function preferSameTab(): boolean {
  if (typeof window === "undefined") return true;
  const narrow = window.matchMedia("(max-width: 720px)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const ua = navigator.userAgent || "";
  const ios = /iPhone|iPad|iPod/i.test(ua);
  return narrow || coarse || ios;
}

/**
 * Live card → crypto. Desktop: payment window. Phone: same-tab then return.
 */
export function InstantCompleteCheckout({
  amountUsd,
  amountLabel,
  network,
  walletAddress,
  sessionId,
  payUrl,
  onPaid,
  onFailed,
  onCancel,
  resumePaid = false,
}: Props) {
  const [phase, setPhase] = useState<"open" | "waiting" | "done">(
    resumePaid ? "done" : "open",
  );
  const [hint, setHint] = useState(
    resumePaid
      ? "Payment received — crypto is settling to your wallet."
      : "Opening secure card payment…",
  );
  const popupRef = useRef<Window | null>(null);
  const openedRef = useRef(false);
  const paidRef = useRef(false);

  useEffect(() => {
    saveInstantSession({
      id: sessionId,
      url: payUrl,
      amountUsd,
      amountLabel,
      network,
      walletAddress,
    });
  }, [sessionId, payUrl, amountUsd, amountLabel, network, walletAddress]);

  useEffect(() => {
    if (resumePaid || openedRef.current) return;
    openedRef.current = true;

    if (preferSameTab()) {
      setPhase("waiting");
      setHint("Continue to card payment — you’ll return here after paying.");
      window.setTimeout(() => {
        window.location.assign(payUrl);
      }, 350);
      return;
    }

    const popup = window.open(
      payUrl,
      "offlinerich_instant_pay",
      "popup=yes,width=480,height=780,noopener=no",
    );

    if (popup) {
      popupRef.current = popup;
      setPhase("waiting");
      setHint(
        "Finish card payment in the secure window. Crypto goes to your wallet.",
      );
      try {
        popup.focus();
      } catch {
        /* ignore */
      }
    } else {
      setHint("Continuing to secure card payment…");
      window.location.assign(payUrl);
    }
  }, [payUrl, resumePaid]);

  useEffect(() => {
    let stopped = false;

    function markDone() {
      if (paidRef.current) return;
      paidRef.current = true;
      stopped = true;
      setPhase("done");
      setHint("Payment complete — crypto is settling to your wallet.");
      clearInstantSession();
      try {
        popupRef.current?.close();
      } catch {
        /* ignore */
      }
      onPaid();
    }

    if (resumePaid) {
      markDone();
    }

    async function tick() {
      try {
        const res = await fetch(
          `/api/onramp/thirdweb/status?id=${encodeURIComponent(sessionId)}`,
        );
        const data = (await res.json()) as {
          status?: string;
          raw?: { data?: { status?: string }; status?: string };
        };
        if (!res.ok) return;
        const status = String(
          data.status ||
            data.raw?.data?.status ||
            data.raw?.status ||
            "",
        ).toLowerCase();
        if (
          DONE.has(status) ||
          status.includes("complete") ||
          status.includes("success")
        ) {
          markDone();
        }
      } catch {
        /* keep polling */
      }
    }

    const id = window.setInterval(() => {
      if (stopped) return;
      void tick();
      try {
        if (popupRef.current?.closed && phase === "waiting" && !paidRef.current) {
          setHint(
            "If you finished paying, crypto is on the way. If not, tap Pay with card again.",
          );
        }
      } catch {
        /* ignore */
      }
    }, 3500);

    void tick();
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [sessionId, onPaid, phase, resumePaid]);

  return (
    <div className="payment-stack onramp-focus instant-complete">
      <div className="destination-summary">
        <p>
          Instant <strong>{amountLabel}</strong> → crypto to{" "}
          <code className="break">{walletAddress}</code> on {network}
        </p>
        <button type="button" className="ghost-link" onClick={onCancel}>
          Change details
        </button>
      </div>

      <div className="setup-panel soft instant-complete-panel">
        <h2>{phase === "done" ? "Crypto on the way" : "Complete payment"}</h2>
        <ol className="instant-steps">
          <li className={phase !== "open" ? "done" : ""}>Details locked</li>
          <li className={phase === "waiting" || phase === "done" ? "done" : ""}>
            Pay with card
          </li>
          <li className={phase === "done" ? "done" : ""}>Crypto to wallet</li>
        </ol>
        <p className="form-hint">{hint}</p>

        {phase !== "done" ? (
          <div className="instant-complete-actions">
            <button
              type="button"
              className="primary-cta"
              onClick={() => {
                if (preferSameTab()) {
                  window.location.assign(payUrl);
                  return;
                }
                const w = window.open(
                  payUrl,
                  "offlinerich_instant_pay",
                  "popup=yes,width=480,height=780",
                );
                if (w) {
                  popupRef.current = w;
                  setPhase("waiting");
                  setHint(
                    "Finish card payment in the secure window. Crypto goes to your wallet.",
                  );
                } else {
                  window.location.assign(payUrl);
                }
              }}
            >
              Pay with card
            </button>
            <button
              type="button"
              className="ghost-link"
              onClick={() => {
                clearInstantSession();
                onFailed("Cancelled. Start Instant again when ready.");
                onCancel();
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <p className="form-hint instant-paid-note" role="status">
            USDC is settling to your wallet. You can close this page.
          </p>
        )}
      </div>
    </div>
  );
}
