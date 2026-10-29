"use client";

import { useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";

import { getStripePublishableKey } from "@/lib/stripePublic";

const publishableKey = getStripePublishableKey();
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

type Props = {
  email?: string;
};

export function StripeCheckout({ email }: Props) {
  const fetchClientSecret = useCallback(async () => {
    const res = await fetch("/api/checkout/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(email ? { email } : {}),
    });
    const data = (await res.json()) as { clientSecret?: string; error?: string };
    if (!res.ok || !data.clientSecret) {
      throw new Error(data.error || "Could not start Stripe Checkout");
    }
    return data.clientSecret;
  }, [email]);

  if (!publishableKey || !stripePromise) {
    return (
      <div className="setup-panel">
        <h2>Missing Stripe publishable key</h2>
        <p>
          Add <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> to{" "}
          <code>.env.local</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="payment-stack stripe-embed">
      <EmbeddedCheckoutProvider
        stripe={stripePromise}
        options={{ fetchClientSecret }}
      >
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
