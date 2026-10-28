"use client";

import { useEffect, useState } from "react";
import {
  CrossmintCheckoutProvider,
  CrossmintEmbeddedCheckout,
  CrossmintProvider,
  useCrossmintCheckout,
} from "@crossmint/client-sdk-react-ui";
import { checkoutAppearance } from "@/lib/crossmint";
import { CheckoutErrorBoundary } from "@/components/CheckoutErrorBoundary";

function OrderStatus() {
  const { order } = useCrossmintCheckout();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!order) return;
    if (order.phase === "completed") {
      setMessage("Payment complete. Delivery is in progress.");
    } else if (order.phase === "payment") {
      setMessage("Pay with card, Apple Pay, or Google Pay.");
    } else if (order.phase === "delivery") {
      setMessage("Payment received. Finalizing delivery…");
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

function CheckoutFrame({ apiKey, collectionId, price }: Props) {
  return (
    <CrossmintProvider apiKey={apiKey}>
      <CrossmintCheckoutProvider>
        <div className="checkout-shell onramp-embed">
          <OrderStatus />
          <CrossmintEmbeddedCheckout
            appearance={checkoutAppearance}
            lineItems={{
              collectionLocator: `crossmint:${collectionId}`,
              callData: {
                totalPrice: price,
                quantity: 1,
              },
            }}
            payment={{
              defaultMethod: "fiat",
              crypto: {
                enabled: true,
                defaultChain: "polygon",
                defaultCurrency: "usdc",
              },
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

/**
 * Mount Crossmint only after client hydration, and behind an error boundary.
 * Avoids React 19.2 DEV logger SecurityError on cross-origin iframe Window props
 * cascading into "Should not already be working."
 */
export function EmbeddedCheckoutMount(props: Props) {
  const [ready, setReady] = useState(false);
  const [mountKey, setMountKey] = useState(0);

  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 0);
    return () => window.clearTimeout(id);
  }, []);

  if (!ready) {
    return <div className="setup-panel">Preparing secure checkout…</div>;
  }

  return (
    <CheckoutErrorBoundary onReset={() => setMountKey((k) => k + 1)}>
      <CheckoutFrame key={mountKey} {...props} />
    </CheckoutErrorBoundary>
  );
}
