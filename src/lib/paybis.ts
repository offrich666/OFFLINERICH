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

/** Paybis partnerId is a product UUID from the partner dashboard. */
function isLikelyPaybisPartnerId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function isPaybisConfigured(): boolean {
  const partnerId = getPaybisPartnerId();
  const hmacKey = getPaybisHmacKey();
  // Reject placeholders like "partner-demo" that only produce widget errors.
  return Boolean(partnerId && hmacKey && isLikelyPaybisPartnerId(partnerId));
}

export function paybisWidgetOrigin(env: PaybisEnv = getPaybisEnvironment()): string {
  return env === "production"
    ? "https://widget.paybis.com"
    : "https://widget.sandbox.paybis.com";
}

export type BuildPaybisRedirectInput = {
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

/**
 * Full-page redirect to Paybis.
 * - Partner keys set → signed widget.paybis.com buy URL
 * - Otherwise → paybis.com so the buyer can pay there directly
 */
export function buildPaybisRedirectUrl(input: BuildPaybisRedirectInput): {
  url: string;
  environment: PaybisEnv | "public";
  mode: "partner_redirect" | "public_redirect";
} {
  const asset = PAYBIS_CRYPTO_BY_NETWORK[input.network];
  if (!asset) {
    throw new Error("Unsupported network for Paybis");
  }

  if (isPaybisConfigured()) {
    const partnerId = getPaybisPartnerId();
    const hmacKey = getPaybisHmacKey();
    const env = getPaybisEnvironment();
    const params: Record<string, string> = {
      amountFrom: String(input.amountUsd),
      cryptoAddress: input.walletAddress,
      currencyCodeFrom: "USD",
      currencyCodeTo: asset.code,
      failureReturnURL: input.failureReturnURL,
      locale: "en",
      partnerId,
      successReturnURL: input.successReturnURL,
      transactionFlow: "buyCrypto",
    };
    if (input.partnerUserId) {
      params.partnerUserId = input.partnerUserId;
    }

    const sortedKeys = Object.keys(params).sort((a, b) => a.localeCompare(b));
    const query = sortedKeys
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k]!)}`)
      .join("&");
    const signature = signPaybisQuery(`?${query}`, hmacKey);
    return {
      url: `${paybisWidgetOrigin(env)}/?${query}&signature=${encodeURIComponent(signature)}`,
      environment: env,
      mode: "partner_redirect",
    };
  }

  // Public Paybis site — buyer completes card→crypto on paybis.com
  const publicParams = new URLSearchParams({
    amountFrom: String(input.amountUsd),
    cryptoAddress: input.walletAddress,
    currencyCodeFrom: "USD",
    currencyCodeTo: asset.code,
    transactionFlow: "buyCrypto",
  });
  return {
    url: `https://paybis.com/?${publicParams.toString()}`,
    environment: "public",
    mode: "public_redirect",
  };
}

/** @deprecated Use buildPaybisRedirectUrl — kept for older callers. */
export function buildPaybisEmbedUrl(input: BuildPaybisRedirectInput): {
  widgetUrl: string;
  environment: PaybisEnv | "public";
} {
  const built = buildPaybisRedirectUrl(input);
  return { widgetUrl: built.url, environment: built.environment };
}
