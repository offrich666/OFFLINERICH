import "server-only";

export type TransakNetworkId =
  | "ethereum"
  | "polygon"
  | "base"
  | "bsc"
  | "solana"
  | "bitcoin";

type TransakEnv = "STAGING" | "PRODUCTION";

const REFRESH_URL: Record<TransakEnv, string> = {
  STAGING: "https://api-stg.transak.com/partners/api/v2/refresh-token",
  PRODUCTION: "https://api.transak.com/partners/api/v2/refresh-token",
};

const SESSION_URL: Record<TransakEnv, string> = {
  STAGING: "https://api-gateway-stg.transak.com/api/v2/auth/session",
  PRODUCTION: "https://api-gateway.transak.com/api/v2/auth/session",
};

/** Map our checkout networks → Transak network + crypto codes. */
export function transakAssetFor(network: string): {
  network: string;
  cryptoCurrencyCode: string;
} | null {
  switch (network) {
    case "ethereum":
      return { network: "ethereum", cryptoCurrencyCode: "USDC" };
    case "polygon":
      return { network: "polygon", cryptoCurrencyCode: "USDC" };
    case "base":
      return { network: "base", cryptoCurrencyCode: "USDC" };
    case "bsc":
      return { network: "bsc", cryptoCurrencyCode: "USDC" };
    case "solana":
      return { network: "solana", cryptoCurrencyCode: "USDC" };
    case "bitcoin":
      return { network: "mainnet", cryptoCurrencyCode: "BTC" };
    default:
      return null;
  }
}

export function getTransakEnvironment(): TransakEnv {
  const raw = (process.env.TRANSAK_ENVIRONMENT || "").toUpperCase();
  if (raw === "STAGING" || raw === "PRODUCTION") return raw;
  // Staging keys work immediately after signup; production needs KYB.
  return "STAGING";
}

export function getTransakApiKey(): string {
  return (
    process.env.TRANSAK_API_KEY ||
    process.env.NEXT_PUBLIC_TRANSAK_API_KEY ||
    ""
  ).trim();
}

export function getTransakApiSecret(): string {
  return (process.env.TRANSAK_API_SECRET || "").trim();
}

export function isTransakConfigured(): boolean {
  return Boolean(getTransakApiKey() && getTransakApiSecret());
}

const tokenCache = new Map<TransakEnv, { token: string; expiresAtMs: number }>();

async function getPartnerAccessToken(env: TransakEnv): Promise<string> {
  const apiKey = getTransakApiKey();
  const apiSecret = getTransakApiSecret();
  if (!apiKey || !apiSecret) {
    throw new Error("Transak API key/secret not configured");
  }

  const now = Date.now();
  const cached = tokenCache.get(env);
  if (cached && cached.expiresAtMs > now + 60_000) {
    return cached.token;
  }

  const res = await fetch(REFRESH_URL[env], {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-api-key": apiKey,
      "api-secret": apiSecret,
    },
    body: JSON.stringify({ apiKey }),
  });
  const data = (await res.json()) as {
    data?: { accessToken?: string; expiresAt?: number };
    error?: { message?: string };
    message?: string;
  };
  const token = data.data?.accessToken;
  if (!res.ok || !token) {
    throw new Error(
      `refresh: ${
        data.error?.message ||
        data.message ||
        `Transak refresh-token failed (${res.status})`
      }`,
    );
  }
  const expiresAtMs = data.data?.expiresAt
    ? data.data.expiresAt * 1000
    : now + 6 * 24 * 60 * 60 * 1000;
  tokenCache.set(env, { token, expiresAtMs });
  return token;
}

export type CreateTransakWidgetInput = {
  amountUsd: number;
  network: string;
  walletAddress: string;
  email?: string;
  referrerDomain: string;
  redirectURL: string;
  userIp?: string | null;
};

function isEnvMismatchError(message: string): boolean {
  return /invalid api key|environment|staging|production/i.test(message);
}

async function createWidgetForEnv(
  env: TransakEnv,
  input: CreateTransakWidgetInput,
): Promise<string> {
  const apiKey = getTransakApiKey();
  const asset = transakAssetFor(input.network);
  if (!asset) {
    throw new Error("Unsupported network for instant crypto");
  }

  const accessToken = await getPartnerAccessToken(env);
  const widgetParams: Record<string, string | number | boolean> = {
    apiKey,
    referrerDomain: input.referrerDomain
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, ""),
    productsAvailed: "BUY",
    cryptoCurrencyCode: asset.cryptoCurrencyCode,
    network: asset.network,
    walletAddress: input.walletAddress,
    disableWalletAddressForm: true,
    fiatCurrency: "USD",
    fiatAmount: input.amountUsd,
    // Lock card — no payment-method / provider picker
    paymentMethod: "credit_debit_card",
    hideMenu: true,
    hideExchangeScreen: true,
    colorMode: "DARK",
    themeColor: "d2b48c",
    exchangeScreenTitle: "Buy crypto",
    redirectURL: input.redirectURL,
  };
  if (input.email) {
    widgetParams.email = input.email;
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
    "x-api-key": apiKey,
    "access-token": accessToken,
  };
  // Prefer a real client IP; fall back so session create still proceeds.
  headers["x-user-ip"] = input.userIp || "8.8.8.8";

  const res = await fetch(SESSION_URL[env], {
    method: "POST",
    headers,
    body: JSON.stringify({ widgetParams }),
  });
  const rawText = await res.text();
  let data: {
    data?: { widgetUrl?: string };
    error?: { message?: string } | string;
    message?: string;
  } = {};
  try {
    data = rawText ? (JSON.parse(rawText) as typeof data) : {};
  } catch {
    data = { message: rawText.slice(0, 240) };
  }
  const widgetUrl = data.data?.widgetUrl;
  if (!res.ok || !widgetUrl) {
    const errMsg =
      (typeof data.error === "string" ? data.error : data.error?.message) ||
      data.message ||
      rawText.slice(0, 240) ||
      `Transak session failed (${res.status})`;
    throw new Error(`session: ${errMsg} [${env} ${res.status}]`);
  }
  return widgetUrl;
}

/**
 * Last-resort public widget URL (no partner session). Staging often still
 * accepts query params for partners who can't mint a session yet.
 */
export function buildPublicTransakWidgetUrl(
  input: CreateTransakWidgetInput,
): { widgetUrl: string; environment: TransakEnv } {
  const env = getTransakEnvironment();
  const apiKey = getTransakApiKey();
  const asset = transakAssetFor(input.network);
  if (!apiKey || !asset) {
    throw new Error("Transak public widget requires API key + network");
  }
  const base =
    env === "STAGING"
      ? "https://global-stg.transak.com"
      : "https://global.transak.com";
  const params = new URLSearchParams({
    apiKey,
    productsAvailed: "BUY",
    cryptoCurrencyCode: asset.cryptoCurrencyCode,
    network: asset.network,
    walletAddress: input.walletAddress,
    disableWalletAddressForm: "true",
    fiatCurrency: "USD",
    fiatAmount: String(input.amountUsd),
    paymentMethod: "credit_debit_card",
    hideMenu: "true",
    hideExchangeScreen: "true",
    colorMode: "DARK",
    themeColor: "d2b48c",
    exchangeScreenTitle: "Buy crypto",
    redirectURL: input.redirectURL,
  });
  if (input.email) params.set("email", input.email);
  return { widgetUrl: `${base}/?${params.toString()}`, environment: env };
}

export async function createTransakWidgetUrl(
  input: CreateTransakWidgetInput,
): Promise<{ widgetUrl: string; environment: TransakEnv }> {
  const preferred = getTransakEnvironment();
  const fallback: TransakEnv =
    preferred === "STAGING" ? "PRODUCTION" : "STAGING";

  let preferredError = "";
  try {
    const widgetUrl = await createWidgetForEnv(preferred, input);
    return { widgetUrl, environment: preferred };
  } catch (err) {
    preferredError = err instanceof Error ? err.message : String(err);
    if (!isEnvMismatchError(preferredError)) throw err;
    console.warn(
      `[transak] ${preferred} failed (${preferredError}); retrying ${fallback}`,
    );
  }

  try {
    const widgetUrl = await createWidgetForEnv(fallback, input);
    return { widgetUrl, environment: fallback };
  } catch (err) {
    const fallbackError = err instanceof Error ? err.message : String(err);
    throw new Error(
      `${preferred}: ${preferredError} | ${fallback}: ${fallbackError}`,
    );
  }
}
