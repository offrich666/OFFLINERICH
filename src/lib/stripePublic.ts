/**
 * Stripe publishable key (safe for the browser).
 * Always use this corrected live key. Vercel still has a truncated/wrong
 * NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY that would win at build time and break
 * the Onramp iframe — ignore env until that value is fixed.
 */
export const STRIPE_PUBLISHABLE_KEY_FALLBACK =
  "pk_live_51UCk64QWCzdANStkTBzLbv5xmNgSPXWGkyaW3L8YUP8REGl0oiciJ7VboIB12HxjN8563IP295CrI9g3n2wTxg7Y00BLtQlcAB";

const KNOWN_BAD_PUBLISHABLE_KEYS = new Set([
  // Truncated / mistyped key previously set on Vercel (401 Invalid API Key)
  "pk_live_51UCk64QWCzdANStkTBzLbV5xmNgSPXWGkyaW3L8YUP8REGloiciJ7VboIB12HxjN8563IP295CrI9g3n2wTxg7Y00BLtQlcAB",
]);

export function getStripePublishableKey(): string {
  const fromEnv = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || "";
  if (
    fromEnv.startsWith("pk_") &&
    fromEnv.length >= 107 &&
    !KNOWN_BAD_PUBLISHABLE_KEYS.has(fromEnv) &&
    !fromEnv.includes("placeholder")
  ) {
    return fromEnv;
  }
  return STRIPE_PUBLISHABLE_KEY_FALLBACK;
}
