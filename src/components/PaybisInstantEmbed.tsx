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

type PaybisEvent = {
  name?: string;
  data?: unknown;
};

/**
 * On-page Paybis Instant — layout=embed iframe.
 * Stays on walletchainsign.com; crypto settles to the buyer wallet.
 */
export function PaybisInstantEmbed({
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
        const res = await fetch("/api/onramp/paybis/session", {
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
          throw new Error(data.error || "Could not start Paybis Instant");
        }
        if (!cancelled) setSrc(data.url);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not start Paybis Instant";
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
      if (!origin.includes("paybis.com") && !origin.includes("payb.is")) {
        return;
      }
      const raw = event.data as PaybisEvent | string | null;
      const name =
        typeof raw === "string"
          ? raw
          : raw && typeof raw === "object"
            ? String(raw.name || "")
            : "";
      if (!name) return;

      if (name === "completed") {
        setPaid(true);
        onPaid?.();
        return;
      }
      if (name === "rejected" || name === "cancelled" || name === "error") {
        onFailed?.("Payment was cancelled or failed. Try again.");
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
        {error || "Paybis Instant is unavailable right now."}
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
          Pay with card below. Crypto goes to your wallet on this page.
        </p>
      )}
      <iframe
        title="Buy crypto"
        src={src}
        className="thirdweb-instant-frame paybis-instant-frame"
        allow="payment *; camera; microphone; clipboard-write; accelerometer; gyroscope"
        referrerPolicy="strict-origin-when-cross-origin"
        loading="eager"
      />
    </div>
  );
}
