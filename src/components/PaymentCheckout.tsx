"use client";

import { EmbeddedCheckoutMount } from "@/components/EmbeddedCheckoutMount";

type Props = {
  apiKey: string;
  collectionId: string;
  price: string;
  verificationBlocked?: boolean;
  verificationMessage?: string;
};

export function PaymentCheckout({
  apiKey,
  collectionId,
  price,
  verificationBlocked,
  verificationMessage,
}: Props) {
  if (!apiKey) {
    return (
      <div className="setup-panel">
        <h2>Missing client API key</h2>
        <p>
          Add <code>NEXT_PUBLIC_CROSSMINT_API_KEY</code> to{" "}
          <code>.env.local</code>.
        </p>
      </div>
    );
  }

  if (!collectionId) {
    return (
      <div className="setup-panel">
        <h2>Collection missing</h2>
        <p>
          Set <code>NEXT_PUBLIC_CROSSMINT_COLLECTION_ID</code> after creating a
          sellable collection.
        </p>
      </div>
    );
  }

  // Do NOT mount the Crossmint iframe while production verification is blocked.
  // Mounting it in Next.js 16 / React 19.2 DEV triggers:
  //   SecurityError: Blocked a frame with origin ... cross-origin frame
  //   Error: Should not already be working.
  if (verificationBlocked) {
    return (
      <div className="payment-stack">
        <div className="blocked-hint">
          <strong>Payment isn’t available yet.</strong>
          <p>
            {verificationMessage ||
              "This checkout path is still being set up. Use the main Pay page, or try again later."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="payment-stack">
      <EmbeddedCheckoutMount
        apiKey={apiKey}
        collectionId={collectionId}
        price={price}
      />
    </div>
  );
}
