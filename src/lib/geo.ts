/**
 * EU/EEA (+ UK for Stripe Onramp) country codes.
 * Stripe Crypto Onramp: US + EU; EU sessions should use source_currency=eur.
 * @see https://docs.stripe.com/crypto/onramp/embedded-components-integration-guide
 */
const EU_ONRAMP_COUNTRIES = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "IS",
  "LI",
  "NO",
  // Stripe Onramp commonly treats UK with EU-style EUR/GBP flows; prefer eur when unsure.
  "GB",
]);

export type OnrampSourceCurrency = "usd" | "eur";

/** Read country from common CDN / platform headers. */
export function countryFromRequest(request: Request): string | null {
  const raw =
    request.headers.get("x-vercel-ip-country") ||
    request.headers.get("cf-ipcountry") ||
    request.headers.get("cloudfront-viewer-country") ||
    "";
  const code = raw.trim().toUpperCase();
  if (!code || code === "XX" || code === "T1") return null;
  return code;
}

export function isEuOnrampCountry(country: string | null | undefined): boolean {
  if (!country) return false;
  return EU_ONRAMP_COUNTRIES.has(country.trim().toUpperCase());
}

/**
 * Pick Onramp fiat currency. EU buyers need eur; US (and unknown) keep usd.
 */
export function onrampSourceCurrencyForRequest(
  request: Request,
): OnrampSourceCurrency {
  const country = countryFromRequest(request);
  if (isEuOnrampCountry(country)) return "eur";
  return "usd";
}
