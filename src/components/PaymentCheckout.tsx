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
          <strong>Crossmint still has to unlock this project.</strong>
          <p>
            {verificationMessage ||
              "Production checkout/onramp requires Crossmint Order Form + KYB, and this collection must be submitted for review in the Console."}
          </p>
          <ol>
            <li>
              Open{" "}
              <a
                href="https://www.crossmint.com/console"
                target="_blank"
                rel="noreferrer"
              >
                Crossmint Console
              </a>
            </li>
            <li>
              Whitelist <code>http://localhost:3000</code> (+ your HTTPS domain)
              on the client API key
            </li>
            <li>
              Open collection <code>{collectionId}</code> → start{" "}
              <strong>Review</strong> from the left sidebar
            </li>
            <li>
              Contact{" "}
              <a
                href="https://www.crossmint.com/contact/sales"
                target="_blank"
                rel="noreferrer"
              >
                Crossmint Sales
              </a>{" "}
              for Order Form + KYB (required for production card/Apple Pay).
              Use contact email <code>groupgrow64@gmail.com</code>.
            </li>
            <li>
              Payout wallet owner: <code>naserademid@gmail.com</code>
            </li>
          </ol>
        </div>
        <p className="fineprint">
          Embedded checkout stays unloaded until Crossmint unlocks the project,
          which also avoids a React development-mode iframe crash on localhost.
        </p>
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
