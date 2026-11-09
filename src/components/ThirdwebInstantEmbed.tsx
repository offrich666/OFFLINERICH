"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildThirdwebInstantEmbedUrl,
  type ThirdwebInstantNetworkId,
} from "@/lib/thirdwebPublic";

type Props = {
  amountUsd: number;
  network: ThirdwebInstantNetworkId;
  walletAddress: string;
  onPaid?: () => void;
  onFailed?: (message: string) => void;
};

type BuyWidgetMessage = {
  source?: string;
  type?: string;
  message?: string;
};

/**
 * On-page Instant checkout — card → USDC on this page.
 * No MoonPay / provider redirect; branding off.
 */
export function ThirdwebInstantEmbed({
  amountUsd,
  network,
  walletAddress,
  onPaid,
  onFailed,
}: Props) {
  const [paid, setPaid] = useState(false);

  const src = useMemo(() => {
    try {
      return buildThirdwebInstantEmbedUrl({
        amountUsd,
        network,
        walletAddress,
      });
    } catch {
      return null;
    }
  }, [amountUsd, network, walletAddress]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== "https://thirdweb.com") return;
      const data = event.data as BuyWidgetMessage | null;
      if (!data || data.source !== "buy-widget") return;

      if (data.type === "success") {
        setPaid(true);
        onPaid?.();
        return;
      }
      if (data.type === "error") {
        onFailed?.(data.message || "Payment failed. Try again.");
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onPaid, onFailed]);

  if (!src) {
    return (
      <p className="form-error">
        Instant is not configured. Add the Instant client key and redeploy.
      </p>
    );
  }

  return (
    <div className="stripe-embed onramp-embed thirdweb-instant-embed">
      {paid ? (
        <p className="form-hint instant-paid-note" role="status">
          Payment received — USDC is settling to your wallet now.
        </p>
      ) : (
        <p className="form-hint instant-buy-hint">
          Pay with card below. Crypto goes straight to your wallet on this page.
        </p>
      )}
      <iframe
        title="Buy crypto"
        src={src}
        className="thirdweb-instant-frame"
        allow="payment *; clipboard-write; accelerometer; gyroscope"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
