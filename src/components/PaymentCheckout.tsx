"use client";

import { useEffect, useState } from "react";
import {
  CrossmintCheckoutProvider,
  CrossmintEmbeddedCheckout,
  CrossmintProvider,
  useCrossmintCheckout,
} from "@crossmint/client-sdk-react-ui";
import { checkoutAppearance } from "@/lib/crossmint";

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

  return (
    <div className="payment-stack">
      {verificationBlocked ? (
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
      ) : null}

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
    </div>
  );
}
