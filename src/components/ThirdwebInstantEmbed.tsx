"use client";

import { useMemo } from "react";
import {
  buildThirdwebInstantEmbedUrl,
  type ThirdwebInstantNetworkId,
} from "@/lib/thirdwebPublic";

type Props = {
  amountUsd: number;
  network: ThirdwebInstantNetworkId;
  walletAddress: string;
};

/**
 * On-page Instant checkout.
 * Stays on walletchainsign.com — provider branding disabled in the widget.
 */
export function ThirdwebInstantEmbed({
  amountUsd,
  network,
  walletAddress,
}: Props) {
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

  if (!src) {
    return (
      <p className="form-error">
        Instant is not configured. Add the Instant client key and redeploy.
      </p>
    );
  }

  return (
    <div className="stripe-embed onramp-embed thirdweb-instant-embed">
      <p className="form-hint" style={{ textAlign: "center", marginBottom: 8 }}>
        Choose <strong>Buy</strong>, then pay with card — crypto goes to your
        wallet.
      </p>
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
