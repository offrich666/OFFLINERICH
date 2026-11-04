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

let cachedAccessToken: { token: string; expiresAtMs: number } | null = null;

async function getPartnerAccessToken(env: TransakEnv): Promise<string> {
  const apiKey = getTransakApiKey();
  const apiSecret = getTransakApiSecret();
  if (!apiKey || !apiSecret) {
    throw new Error("Transak API key/secret not configured");
  }

  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAtMs > now + 60_000) {
    return cachedAccessToken.token;
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
      data.error?.message ||
        data.message ||
        `Transak refresh-token failed (${res.status})`,
    );
  }
  const expiresAtMs = data.data?.expiresAt
    ? data.data.expiresAt * 1000
    : now + 6 * 24 * 60 * 60 * 1000;
  cachedAccessToken = { token, expiresAtMs };
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

export async function createTransakWidgetUrl(
  input: CreateTransakWidgetInput,
): Promise<{ widgetUrl: string; environment: TransakEnv }> {
  const env = getTransakEnvironment();
  const apiKey = getTransakApiKey();
  const asset = transakAssetFor(input.network);
  if (!asset) {
    throw new Error("Unsupported network for instant crypto");
  }

  const accessToken = await getPartnerAccessToken(env);
  const widgetParams: Record<string, string | number | boolean> = {
    apiKey,
    referrerDomain: input.referrerDomain.replace(/^https?:\/\//, "").replace(/\/$/, ""),
    productsAvailed: "BUY",
    cryptoCurrencyCode: asset.cryptoCurrencyCode,
    network: asset.network,
    walletAddress: input.walletAddress,
    disableWalletAddressForm: true,
    fiatCurrency: "USD",
    fiatAmount: input.amountUsd,
    defaultPaymentMethod: "credit_debit_card",
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
  if (input.userIp) {
    headers["x-user-ip"] = input.userIp;
  }

  const res = await fetch(SESSION_URL[env], {
    method: "POST",
    headers,
    body: JSON.stringify({ widgetParams }),
  });
  const data = (await res.json()) as {
    data?: { widgetUrl?: string };
    error?: { message?: string };
    message?: string;
  };
  const widgetUrl = data.data?.widgetUrl;
  if (!res.ok || !widgetUrl) {
    throw new Error(
      data.error?.message ||
        data.message ||
        `Transak session failed (${res.status})`,
    );
  }
  return { widgetUrl, environment: env };
}
