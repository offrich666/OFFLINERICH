"use client";

import Link from "next/link";

/**
 * Legacy hosted Link entry — disabled.
 * Buyers use on-page Stripe Crypto Onramp embed at /checkout.
 */
export function StripeOnrampCheckout() {
  return (
    <div className="setup-panel soft">
      <h2>Use on-page checkout</h2>
      <p>
        Hosted off-site payments are turned off. Buy crypto with the form that
        stays on this site — crypto settles to your wallet.
      </p>
      <Link href="/checkout" className="primary-cta">
        Go to checkout
      </Link>
    </div>
  );
}
