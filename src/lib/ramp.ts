import "server-only";

/**
 * Ramp Network hosted onramp — card/Apple/Google Pay → crypto to client wallet.
 * Works without Transak. Optional RAMP_HOST_API_KEY improves tracking when set.
 */

export function rampAssetFor(network: string): string | null {
  switch (network) {
    case "ethereum":
      // Ramp lists Ethereum USDC as plain "USDC" (chain ETH).
      return "USDC";
    case "polygon":
      return "MATIC_USDC";
    case "base":
      return "BASE_USDC";
    case "bsc":
      return "BSC_USDC";
    case "solana":
      return "SOLANA_USDC";
    case "bitcoin":
      return "BTC";
    default:
      return null;
  }
}

export type CreateRampWidgetInput = {
  amountUsd: number;
  network: string;
  walletAddress: string;
  email?: string;
  finalUrl: string;
  logoUrl: string;
};

export function buildRampWidgetUrl(input: CreateRampWidgetInput): string {
  const asset = rampAssetFor(input.network);
  if (!asset) {
    throw new Error("Unsupported network for Instant crypto");
  }

  // Fiat value in minor units (ISO-4217): $25.00 → "2500"
  const inAssetValue = String(Math.round(input.amountUsd * 100));

  const params = new URLSearchParams({
    hostAppName: "OFFLINERICH",
    hostLogoUrl: input.logoUrl,
    defaultFlow: "ONRAMP",
    enabledFlows: "ONRAMP",
    inAsset: "USD",
    inAssetValue,
    outAsset: asset,
    enabledCryptoAssets: asset,
    userAddress: input.walletAddress,
    finalUrl: input.finalUrl,
    successUrl: input.finalUrl,
    paymentMethodType: "CARD_PAYMENT",
    variant: "hosted",
  });

  const apiKey = (process.env.RAMP_HOST_API_KEY || "").trim();
  if (apiKey) {
    params.set("hostApiKey", apiKey);
  }
  if (input.email) {
    params.set("userEmailAddress", input.email);
  }

  return `https://app.rampnetwork.com/?${params.toString()}`;
}

/** MoonPay consumer buy URL — no partner key required (wallet entered in widget). */
export function buildMoonPayFallbackUrl(input: {
  amountUsd: number;
  redirectURL: string;
}): string {
  const params = new URLSearchParams({
    baseCurrencyCode: "usd",
    baseCurrencyAmount: String(input.amountUsd),
    defaultCurrencyCode: "usdc",
    colorCode: "d2b48c",
    redirectURL: input.redirectURL,
  });
  return `https://buy.moonpay.com/v2/buy?${params.toString()}`;
}
