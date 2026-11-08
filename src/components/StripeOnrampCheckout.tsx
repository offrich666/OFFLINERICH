"use client";

import Link from "next/link";

/**
 * Legacy Stripe Instant / crypto.link.com path — disabled.
 * Buyers use on-page Crossmint card checkout instead.
 */
export function StripeOnrampCheckout() {
  return (
    <div className="setup-panel soft">
      <h2>Use on-page checkout</h2>
      <p>
        Hosted crypto.link.com payments are turned off. Buy crypto with a card
        form that stays on this site.
      </p>
      <Link href="/checkout" className="primary-cta">
        Go to checkout
      </Link>
    </div>
  );
}
