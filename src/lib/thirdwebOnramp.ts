import "server-only";
import { USDC_BY_NETWORK, type ThirdwebInstantNetworkId } from "@/lib/thirdwebPublic";

const PREPARE_URL = "https://bridge.thirdweb.com/v1/onramp/prepare";
const STATUS_URL = "https://bridge.thirdweb.com/v1/onramp/status";

/** Providers that actually complete card → wallet via thirdweb. Skip Stripe Onramp. */
const PROVIDERS = ["transak", "coinbase"] as const;
type Provider = (typeof PROVIDERS)[number];

function getSecret(): string {
  return (process.env.THIRDWEB_SECRET_KEY || "").trim();
}

function getClientId(): string {
  return (process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "").trim();
}

export function isThirdwebOnrampConfigured(): boolean {
  return Boolean(getSecret() && getClientId());
}

/** USDC amount → wei-style integer string (6 decimals). */
export function usdcAmountToBaseUnits(amountUsd: number): string {
  const n = Math.round(amountUsd * 1_000_000);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("Invalid amount");
  }
  return String(n);
}

export type PrepareInstantInput = {
  amountUsd: number;
  network: ThirdwebInstantNetworkId;
  walletAddress: string;
  country?: string;
};

export type PreparedInstant = {
  id: string;
  link: string;
  provider: Provider;
  currencyAmount: number;
  currency: string;
};

async function prepareOne(
  provider: Provider,
  input: PrepareInstantInput,
): Promise<PreparedInstant> {
  const secret = getSecret();
  const clientId = getClientId();
  const asset = USDC_BY_NETWORK[input.network];
  if (!secret || !clientId || !asset) {
    throw new Error("Instant is not configured");
  }

  const receiver = input.walletAddress.trim().toLowerCase();
  const body: Record<string, unknown> = {
    onramp: provider,
    chainId: asset.chainId,
    tokenAddress: asset.tokenAddress,
    receiver,
    amount: usdcAmountToBaseUnits(input.amountUsd),
    currency: "USD",
  };
  if (input.country) body.country = input.country;

  const res = await fetch(PREPARE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-secret-key": secret,
      "x-client-id": clientId,
    },
    body: JSON.stringify(body),
  });
  const raw = (await res.json()) as {
    data?: {
      id?: string;
      link?: string;
      currencyAmount?: number;
      currency?: string;
    };
    id?: string;
    link?: string;
    currencyAmount?: number;
    currency?: string;
    message?: string;
    code?: string;
  };
  const data = raw.data || raw;
  if (!res.ok || !data.id || !data.link) {
    throw new Error(
      raw.message || raw.code || `Instant ${provider} failed (${res.status})`,
    );
  }
  return {
    id: data.id,
    link: data.link,
    provider,
    currencyAmount: Number(data.currencyAmount ?? input.amountUsd),
    currency: String(data.currency || "USD"),
  };
}

/** Attach return URL so mobile buyers land back on checkout after pay. */
export function withCheckoutReturnUrl(
  link: string,
  returnUrl: string,
  sessionId: string,
): string {
  try {
    const url = new URL(link);
    const ret = new URL(returnUrl);
    ret.searchParams.set("paid", "1");
    ret.searchParams.set("sid", sessionId);
    url.searchParams.set("redirectURL", ret.toString());
    // Coinbase / others sometimes read these aliases
    if (!url.searchParams.has("redirectUrl")) {
      url.searchParams.set("redirectUrl", ret.toString());
    }
    return url.toString();
  } catch {
    return link;
  }
}

/** Prefer Transak (card → USDC). Fall back to Coinbase. Never Stripe Onramp. */
export async function prepareInstantOnramp(
  input: PrepareInstantInput,
): Promise<PreparedInstant> {
  let lastError = "Could not start Instant";
  for (const provider of PROVIDERS) {
    try {
      return await prepareOne(provider, input);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[thirdwebOnramp] ${provider} failed:`, lastError);
    }
  }
  throw new Error(lastError);
}

export async function getInstantOnrampStatus(id: string): Promise<{
  id: string;
  status: string;
  raw: unknown;
}> {
  const secret = getSecret();
  const clientId = getClientId();
  if (!secret || !clientId) {
    throw new Error("Instant is not configured");
  }
  const url = `${STATUS_URL}?id=${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "x-secret-key": secret,
      "x-client-id": clientId,
    },
  });
  const raw = await res.json();
  if (!res.ok) {
    const message =
      (raw as { message?: string }).message ||
      `Status failed (${res.status})`;
    throw new Error(message);
  }
  const data = (raw as { data?: { id?: string; status?: string } }).data || raw;
  return {
    id: String((data as { id?: string }).id || id),
    status: String((data as { status?: string }).status || "unknown"),
    raw,
  };
}
