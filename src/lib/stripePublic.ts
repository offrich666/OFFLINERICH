/**
 * Stripe publishable key (safe for the browser).
 * Fallback is baked in so production works without editing Vercel env
 * (Hobby limits / missing NEXT_PUBLIC_*). Override via env when set.
 */
export const STRIPE_PUBLISHABLE_KEY_FALLBACK =
  "pk_live_51UCk64QWCzdANStkTBzLbv5xmNgSPXWGkyaW3L8YUP8REGl0oiciJ7VboIB12HxjN8563IP295CrI9g3n2wTxg7Y00BLtQlcAB";

export function getStripePublishableKey(): string {
  const fromEnv = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  if (fromEnv && !fromEnv.includes("placeholder")) return fromEnv;
  return STRIPE_PUBLISHABLE_KEY_FALLBACK;
}
