"use client";

import { useEffect, useState } from "react";
import {
  CrossmintCheckoutProvider,
  CrossmintEmbeddedCheckout,
  CrossmintProvider,
  useCrossmintCheckout,
} from "@crossmint/client-sdk-react-ui";

function OrderStatus() {
  const { order } = useCrossmintCheckout();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!order) return;
    if (order.phase === "completed") {
      setMessage("Payment complete. Your drop is on the way.");
    } else if (order.phase === "payment") {
      setMessage("Waiting for payment…");
    }
  }, [order]);

  if (!message) return null;

  return <p className="status-line">{message}</p>;
}

type Props = {
  apiKey: string;
  collectionId: string;
  price: string;
};

export function CrossmintCheckout({ apiKey, collectionId, price }: Props) {
  if (!apiKey) {
    return (
      <div className="setup-panel">
        <h2>Missing client API key</h2>
        <p>
          Add <code>NEXT_PUBLIC_CROSSMINT_API_KEY</code> to{" "}
          <code>.env.local</code>, then restart the dev server.
        </p>
      </div>
    );
  }

  if (!collectionId) {
    return (
      <div className="setup-panel">
        <h2>Collection not configured</h2>
        <p>
          Your Crossmint project only has default collections without payments
          enabled. Create a sellable collection, then set{" "}
          <code>NEXT_PUBLIC_CROSSMINT_COLLECTION_ID</code>.
        </p>
        <ol>
          <li>
            Add your payout wallet to <code>CROSSMINT_PAYOUT_ADDRESS</code> in{" "}
            <code>.env.local</code>
          </li>
          <li>
            Run <code>npm run setup:collection</code>
          </li>
          <li>
            In Crossmint Console → API Keys, whitelist{" "}
            <code>http://localhost:3000</code> on the client key
          </li>
          <li>Restart <code>npm run dev</code></li>
        </ol>
      </div>
    );
  }

  return (
    <CrossmintProvider apiKey={apiKey}>
      <CrossmintCheckoutProvider>
        <div className="checkout-shell">
          <OrderStatus />
          <CrossmintEmbeddedCheckout
            lineItems={{
              collectionLocator: `crossmint:${collectionId}`,
              callData: {
                totalPrice: price,
                quantity: 1,
              },
            }}
            payment={{
              crypto: { enabled: true },
              fiat: {
                enabled: true,
                defaultCurrency: "usd",
                allowedMethods: {
                  card: true,
                  applePay: true,
                  googlePay: true,
                },
              },
            }}
          />
        </div>
      </CrossmintCheckoutProvider>
    </CrossmintProvider>
  );
}
