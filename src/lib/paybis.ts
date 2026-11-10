import "server-only";
import { createHmac } from "crypto";

export type PaybisEnv = "sandbox" | "production";

/** Merchant contact for this Paybis product (dashboard login). */
export const PAYBIS_MERCHANT_EMAIL = "richoffline666@gmail.com";

/**
 * Paybis crypto asset codes for Buy crypto.
 * Adjust in dashboard / currency-pairs if your product uses different codes.
 */
export const PAYBIS_CRYPTO_BY_NETWORK: Record<
  string,
  { code: string; label: string }
> = {
  ethereum: { code: "USDC", label: "Ethereum USDC" },
  polygon: { code: "USDC-POLYGON", label: "Polygon USDC" },
  base: { code: "USDC-BASE", label: "Base USDC" },
  // Paybis lists USDC mainly on ETH / Polygon / Base / Solana
  bsc: { code: "USDC", label: "USDC (ERC20)" },
};

export function getPaybisEnvironment(): PaybisEnv {
  const raw = (process.env.PAYBIS_ENVIRONMENT || "").trim().toLowerCase();
  if (raw === "production" || raw === "prod" || raw === "live") {
    return "production";
  }
  return "sandbox";
}

export function getPaybisPartnerId(): string {
  return (process.env.PAYBIS_PARTNER_ID || "").trim();
}

export function getPaybisHmacKey(): string {
  return (process.env.PAYBIS_HMAC_KEY || "").trim();
}

export function isPaybisConfigured(): boolean {
  return Boolean(getPaybisPartnerId() && getPaybisHmacKey());
}

export function paybisWidgetOrigin(env: PaybisEnv = getPaybisEnvironment()): string {
  return env === "production"
    ? "https://widget.paybis.com"
    : "https://widget.sandbox.paybis.com";
}

export type BuildPaybisEmbedInput = {
  amountUsd: number;
  network: string;
  walletAddress: string;
  /** Buyer id in our system (email or wallet). */
  partnerUserId?: string;
  successReturnURL: string;
  failureReturnURL: string;
};

/**
 * Sign Paybis standalone widget query (HMAC-SHA256 over `?sortedParams`).
 * Key is base64-encoded per Paybis docs.
 */
export function signPaybisQuery(queryWithoutSignature: string, hmacKey: string): string {
  const message = queryWithoutSignature.startsWith("?")
    ? queryWithoutSignature
    : `?${queryWithoutSignature}`;
  const key = Buffer.from(hmacKey, "base64");
  return createHmac("sha256", key).update(message, "utf8").digest("base64");
}

/** Build on-page embed URL: card buy → USDC to buyer wallet. */
export function buildPaybisEmbedUrl(input: BuildPaybisEmbedInput): {
  widgetUrl: string;
  environment: PaybisEnv;
} {
  const partnerId = getPaybisPartnerId();
  const hmacKey = getPaybisHmacKey();
  const env = getPaybisEnvironment();
  const asset = PAYBIS_CRYPTO_BY_NETWORK[input.network];
  if (!partnerId || !hmacKey) {
    throw new Error("Paybis is not configured");
  }
  if (!asset) {
    throw new Error("Unsupported network for Paybis Instant");
  }

  const params: Record<string, string> = {
    amountFrom: String(input.amountUsd),
    canClose: "false",
    cryptoAddress: input.walletAddress,
    currencyCodeFrom: "USD",
    currencyCodeTo: asset.code,
    failureReturnURL: input.failureReturnURL,
    layout: "embed",
    locale: "en",
    partnerId,
    successReturnURL: input.successReturnURL,
    transactionFlow: "buyCrypto",
  };
  if (input.partnerUserId) {
    params.partnerUserId = input.partnerUserId;
  }

  // Alphabetical order A→Z required before signing
  const sortedKeys = Object.keys(params).sort((a, b) => a.localeCompare(b));
  const query = sortedKeys
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k]!)}`)
    .join("&");
  const signature = signPaybisQuery(`?${query}`, hmacKey);
  const widgetUrl = `${paybisWidgetOrigin(env)}/?${query}&signature=${encodeURIComponent(signature)}`;
  return { widgetUrl, environment: env };
}
