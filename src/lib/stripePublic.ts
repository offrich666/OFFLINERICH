/**
 * Stripe publishable key (browser-safe).
 * Always return the corrected live key. Do not trust
 * NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY on Vercel — it still holds a
 * truncated value that Stripe rejects with 401.
 */
export const STRIPE_PUBLISHABLE_KEY_FALLBACK =
  "pk_live_51UCk64QWCzdANStkTBzLbv5xmNgSPXWGkyaW3L8YUP8REGl0oiciJ7VboIB12HxjN8563IP295CrI9g3n2wTxg7Y00BLtQlcAB";

export function getStripePublishableKey(): string {
  return STRIPE_PUBLISHABLE_KEY_FALLBACK;
}
