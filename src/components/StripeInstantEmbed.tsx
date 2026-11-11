"use client";

import { loadStripeOnramp } from "@stripe/crypto";
import { CryptoElements, OnrampElement } from "@/components/StripeCryptoElements";
import { getStripePublishableKey } from "@/lib/stripePublic";

const publishableKey = getStripePublishableKey();
const stripeOnrampPromise = publishableKey
  ? loadStripeOnramp(publishableKey)
  : Promise.resolve(null);

type Props = {
  clientSecret: string;
  onPaid?: () => void;
  onFailed?: (message: string) => void;
};

/**
 * Live Stripe Crypto Onramp — card → crypto to the buyer wallet, on this page.
 */
export function StripeInstantEmbed({ clientSecret, onPaid, onFailed }: Props) {
  if (!publishableKey || !stripeOnrampPromise) {
    return (
      <p className="form-error">
        Instant is not configured. Add the Stripe publishable key and redeploy.
      </p>
    );
  }

  return (
    <div className="stripe-embed onramp-embed thirdweb-instant-embed stripe-onramp-shell">
      <p className="form-hint instant-buy-hint">
        Crossmint Onramp — pay with card below. Scroll to use Continue.
      </p>
      <p className="form-hint onramp-scroll-hint">
        If Continue is hidden, scroll down inside the payment panel.
      </p>
      <CryptoElements stripeOnramp={stripeOnrampPromise}>
        <OnrampElement
          clientSecret={clientSecret}
          appearance={{ theme: "dark" }}
          className="stripe-onramp-frame"
          onComplete={onPaid}
          onError={onFailed}
        />
      </CryptoElements>
    </div>
  );
}
