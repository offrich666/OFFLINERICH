"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  amountLabel: string;
  network: string;
  walletAddress: string;
  sessionId: string;
  payUrl: string;
  onPaid: () => void;
  onFailed: (message: string) => void;
  onCancel: () => void;
};

const DONE = new Set([
  "completed",
  "complete",
  "success",
  "successful",
  "fulfilled",
  "fulfillment_complete",
]);

/**
 * Opens the live card→crypto session (Transak/Coinbase via thirdweb).
 * Parent page stays on checkout and polls until crypto settles.
 */
export function InstantCompleteCheckout({
  amountLabel,
  network,
  walletAddress,
  sessionId,
  payUrl,
  onPaid,
  onFailed,
  onCancel,
}: Props) {
  const [phase, setPhase] = useState<"open" | "waiting" | "done" | "error">(
    "open",
  );
  const [hint, setHint] = useState("Opening secure card payment…");
  const popupRef = useRef<Window | null>(null);
  const openedRef = useRef(false);

  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;

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
      // Popup blocked — same-tab is the only way that still completes.
      setHint("Continuing to secure card payment…");
      window.location.assign(payUrl);
    }
  }, [payUrl]);

  useEffect(() => {
    let stopped = false;

    async function tick() {
      try {
        const res = await fetch(
          `/api/onramp/thirdweb/status?id=${encodeURIComponent(sessionId)}`,
        );
        const data = (await res.json()) as {
          status?: string;
          error?: string;
          raw?: { data?: { status?: string }; status?: string };
        };
        if (!res.ok) return;
        const status = String(
          data.status ||
            data.raw?.data?.status ||
            data.raw?.status ||
            "",
        ).toLowerCase();
        if (DONE.has(status) || status.includes("complete") || status.includes("success")) {
          stopped = true;
          setPhase("done");
          setHint("Payment complete — crypto is settling to your wallet.");
          try {
            popupRef.current?.close();
          } catch {
            /* ignore */
          }
          onPaid();
        }
      } catch {
        /* keep polling */
      }
    }

    const id = window.setInterval(() => {
      if (stopped) return;
      void tick();
      try {
        if (popupRef.current && popupRef.current.closed && phase === "waiting") {
          setHint(
            "If you finished paying, crypto is on the way. If not, tap Open payment again.",
          );
        }
      } catch {
        /* ignore */
      }
    }, 4000);

    void tick();
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [sessionId, onPaid, phase]);

  return (
    <div className="payment-stack onramp-focus">
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
        <p className="form-hint">{hint}</p>

        {phase !== "done" ? (
          <div className="instant-complete-actions">
            <button
              type="button"
              className="primary-cta"
              onClick={() => {
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
              Open payment
            </button>
            <button
              type="button"
              className="ghost-link"
              onClick={() => {
                onFailed("Payment window closed. Start Instant again when ready.");
                onCancel();
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <p className="form-hint instant-paid-note" role="status">
            Keep this page — USDC is settling to your wallet now.
          </p>
        )}
      </div>
    </div>
  );
}
