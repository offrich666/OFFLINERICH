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
 * On-page Instant checkout iframe.
 * Buyer stays on walletchainsign.com; provider chrome/branding is disabled.
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
