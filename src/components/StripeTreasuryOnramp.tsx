"use client";

import Link from "next/link";

/**
 * Legacy Stripe treasury onramp — disabled (no crypto.link.com).
 */
export function StripeTreasuryOnramp() {
  return (
    <div className="setup-panel soft">
      <h2>Use on-page checkout</h2>
      <p>Hosted Instant checkout is disabled. Continue on /checkout.</p>
      <Link href="/checkout" className="primary-cta">
        Go to checkout
      </Link>
    </div>
  );
}
