import "server-only";

/**
 * Instant crypto (no partner key required for open):
 * 1) MoonPay consumer buy — completable card → crypto
 * 2) Onramper aggregator fallback with wallet hint
 */

export function moonPayCurrencyFor(network: string): string | null {
  switch (network) {
    case "ethereum":
      return "usdc";
    case "polygon":
      return "usdc_polygon";
    case "base":
      return "usdc_base";
    case "bsc":
      return "usdc_bsc";
    case "solana":
      return "usdc_sol";
    case "bitcoin":
      return "btc";
    default:
      return null;
  }
}

export function onramperCryptoId(network: string): string | null {
  switch (network) {
    case "ethereum":
      return "usdc_ethereum";
    case "polygon":
      return "usdc_polygon";
    case "base":
      return "usdc_base";
    case "bsc":
      return "usdc_bsc";
    case "solana":
      return "usdc_solana";
    case "bitcoin":
      return "btc";
    default:
      return null;
  }
}

export type InstantWidgetInput = {
  amountUsd: number;
  network: string;
  walletAddress: string;
  email?: string;
  redirectURL: string;
};

/** MoonPay hosted buy — verified working without partner API key. */
export function buildMoonPayWidgetUrl(input: InstantWidgetInput): string {
  const currency = moonPayCurrencyFor(input.network);
  if (!currency) {
    throw new Error("Unsupported network for Instant crypto");
  }

  const params = new URLSearchParams({
    baseCurrencyCode: "usd",
    baseCurrencyAmount: String(input.amountUsd),
    defaultCurrencyCode: currency,
    walletAddress: input.walletAddress,
    redirectURL: input.redirectURL,
    colorCode: "d2b48c",
  });

  // Optional publishable key improves branding/tracking when present.
  const apiKey = (process.env.MOONPAY_API_KEY || "").trim();
  if (apiKey) {
    params.set("apiKey", apiKey);
  }
  if (input.email) {
    params.set("email", input.email);
  }

  return `https://buy.moonpay.com/v2/buy?${params.toString()}`;
}

/** Onramper fallback — aggregator buy UI with wallet prefill. */
export function buildOnramperWidgetUrl(input: InstantWidgetInput): string {
  const crypto = onramperCryptoId(input.network);
  if (!crypto) {
    throw new Error("Unsupported network for Instant crypto");
  }

  const params = new URLSearchParams({
    defaultAmount: String(input.amountUsd),
    defaultCrypto: crypto,
    onlyCryptos: crypto,
    wallets: `${crypto}:${input.walletAddress}`,
    themeName: "light",
  });

  const apiKey = (process.env.ONRAMPER_API_KEY || "").trim();
  if (apiKey) {
    params.set("apiKey", apiKey);
  }

  return `https://buy.onramper.com?${params.toString()}`;
}
