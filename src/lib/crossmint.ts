export type OnrampChain = "polygon" | "base" | "solana";

export type UsdcEnvironment = "production" | "staging";

const PRODUCTION_USDC: Record<OnrampChain, string> = {
  polygon: "polygon:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
  base: "base:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  solana: "solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};

const STAGING_USDC: Record<OnrampChain, string> = {
  polygon: "polygon-amoy:0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582",
  base: "base-sepolia:0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  solana: "solana:4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
};

const DEFAULT_PRODUCTION_ORDERS =
  "https://www.crossmint.com/api/2022-06-09";
const DEFAULT_STAGING_ORDERS =
  "https://staging.crossmint.com/api/2022-06-09";
const DEFAULT_PRODUCTION_WALLETS =
  "https://www.crossmint.com/api/2025-06-09";
const DEFAULT_STAGING_WALLETS =
  "https://staging.crossmint.com/api/2025-06-09";

export function getUsdcEnvironment(): UsdcEnvironment {
  const explicit = process.env.NEXT_PUBLIC_CROSSMINT_ENV?.toLowerCase();
  if (explicit === "staging" || explicit === "production") {
    return explicit;
  }
  const key =
    process.env.CROSSMINT_SERVER_API_KEY ||
    process.env.NEXT_PUBLIC_CROSSMINT_API_KEY ||
    "";
  return key.includes("_staging_") ? "staging" : "production";
}

export function getCrossmintApiBase() {
  if (process.env.CROSSMINT_API_BASE) {
    return process.env.CROSSMINT_API_BASE.replace(/\/$/, "");
  }
  return getUsdcEnvironment() === "staging"
    ? DEFAULT_STAGING_ORDERS
    : DEFAULT_PRODUCTION_ORDERS;
}

export function getWalletsApiBase() {
  if (process.env.CROSSMINT_WALLETS_API_BASE) {
    return process.env.CROSSMINT_WALLETS_API_BASE.replace(/\/$/, "");
  }
  return getUsdcEnvironment() === "staging"
    ? DEFAULT_STAGING_WALLETS
    : DEFAULT_PRODUCTION_WALLETS;
}

export function getServerApiKey() {
  const key = process.env.CROSSMINT_SERVER_API_KEY;
  if (!key) {
    throw new Error("CROSSMINT_SERVER_API_KEY is not set");
  }
  return key;
}

export function getClientApiKey() {
  return process.env.NEXT_PUBLIC_CROSSMINT_API_KEY ?? "";
}

export function getCollectionId() {
  return process.env.NEXT_PUBLIC_CROSSMINT_COLLECTION_ID ?? "";
}

export function getCheckoutPrice() {
  return process.env.NEXT_PUBLIC_CROSSMINT_PRICE ?? "1";
}

export function getDefaultOnrampAmount() {
  return process.env.NEXT_PUBLIC_ONRAMP_DEFAULT_AMOUNT ?? "20";
}

export function getDefaultOnrampChain(): OnrampChain {
  const value = process.env.NEXT_PUBLIC_ONRAMP_DEFAULT_CHAIN?.toLowerCase();
  if (value === "base" || value === "solana" || value === "polygon") {
    return value;
  }
  return "polygon";
}

export function getUsdcTokenLocator(chain: OnrampChain) {
  const env = getUsdcEnvironment();
  return env === "staging" ? STAGING_USDC[chain] : PRODUCTION_USDC[chain];
}

export function chainTypeFor(chain: OnrampChain): "evm" | "solana" {
  return chain === "solana" ? "solana" : "evm";
}

export async function crossmintFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
  baseUrl = getCrossmintApiBase(),
): Promise<{ ok: boolean; status: number; data: T }> {
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("X-API-KEY", getServerApiKey());
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...init, headers });
  const text = await response.text();
  let data: T;
  try {
    data = text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    data = { message: text } as T;
  }

  return { ok: response.ok, status: response.status, data };
}

export const checkoutAppearance = {
  fonts: [
    {
      cssSrc:
        "https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600&family=Syne:wght@600;700&display=swap",
    },
  ],
  variables: {
    fontFamily: "Figtree, system-ui, sans-serif",
    borderRadius: "4px",
    colors: {
      backgroundPrimary: "#14161b",
      textPrimary: "#d7dde8",
      textSecondary: "#9aa3b2",
      borderPrimary: "rgba(215, 221, 232, 0.18)",
      accent: "#d2b48c",
      danger: "#e35d6a",
      warning: "#d2b48c",
    },
  },
  rules: {
    PrimaryButton: {
      colors: {
        background: "#d2b48c",
        text: "#1a140c",
      },
      hover: {
        colors: {
          background: "#e2c9a0",
        },
      },
    },
    Input: {
      colors: {
        background: "#0f1116",
        border: "rgba(215, 221, 232, 0.18)",
        text: "#d7dde8",
        placeholder: "#6f7785",
      },
    },
  },
};
