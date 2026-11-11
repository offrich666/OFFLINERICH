"use client";

import { useEffect, useState } from "react";

type Props = {
  amountUsd: number;
  network: string;
  walletAddress: string;
  email?: string;
  onPaid?: () => void;
  onFailed?: (message: string) => void;
};

type TransakMessage = {
  event_id?: string;
  data?: unknown;
};

/**
 * On-page Instant: locked card buy → crypto to the buyer wallet.
 * Stays on walletchainsign.com — no provider picker, no off-site hop.
 */
export function TransakInstantEmbed({
  amountUsd,
  network,
  walletAddress,
  email,
  onPaid,
  onFailed,
}: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      setLoading(true);
      setError(null);
      setSrc(null);
      try {
        const res = await fetch("/api/onramp/transak/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountUsd,
            network,
            wallet: walletAddress,
            email: email || undefined,
          }),
        });
        const data = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !data.url) {
          throw new Error(data.error || "Could not start Instant checkout");
        }
        if (!cancelled) {
          setSrc(data.url);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not start Instant checkout";
        if (!cancelled) {
          setError(message);
          onFailed?.(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void start();
    return () => {
      cancelled = true;
    };
  }, [amountUsd, network, walletAddress, email, onFailed]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const origin = event.origin || "";
      if (
        !origin.includes("transak.com") &&
        !origin.includes("transak.io")
      ) {
        return;
      }
      const data = event.data as TransakMessage | null;
      if (!data?.event_id) return;

      if (data.event_id === "TRANSAK_ORDER_SUCCESSFUL") {
        setPaid(true);
        onPaid?.();
        return;
      }
      if (data.event_id === "TRANSAK_ORDER_FAILED") {
        onFailed?.("Payment failed. Try again with another card.");
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onPaid, onFailed]);

  if (loading) {
    return (
      <div className="stripe-embed onramp-embed thirdweb-instant-embed">
        <p className="form-hint instant-buy-hint">Opening secure card checkout…</p>
      </div>
    );
  }

  if (error || !src) {
    return (
      <p className="form-error">
        {error || "Instant checkout is unavailable right now."}
      </p>
    );
  }

  return (
    <div className="stripe-embed onramp-embed thirdweb-instant-embed">
      {paid ? (
        <p className="form-hint instant-paid-note" role="status">
          Payment received — crypto is settling to your wallet now.
        </p>
      ) : (
        <p className="form-hint instant-buy-hint">
          Pay with card below. Crypto goes straight to your wallet on this page.
        </p>
      )}
      <iframe
        title="Buy crypto"
        src={src}
        className="thirdweb-instant-frame transak-iframe"
        allow="camera; microphone; payment *; clipboard-write"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
