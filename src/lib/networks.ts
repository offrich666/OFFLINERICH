/** All networks we may deliver to (ops / legacy). */
export const CLIENT_NETWORKS = [
  { id: "polygon", label: "Polygon", kind: "evm", asset: "USDC" },
  { id: "ethereum", label: "Ethereum", kind: "evm", asset: "USDC" },
  { id: "base", label: "Base", kind: "evm", asset: "USDC" },
  { id: "bsc", label: "BNB Smart Chain (BSC)", kind: "evm", asset: "USDC" },
  { id: "bitcoin", label: "Bitcoin", kind: "bitcoin", asset: "BTC" },
] as const;

/**
 * Networks Stripe Crypto Onramp can settle to for this EU merchant.
 * Only these appear in client checkout — wallet is locked to the client's
 * own address so Stripe never shows the treasury.
 */
export const ONRAMP_CLIENT_NETWORKS = [
  { id: "ethereum", label: "Ethereum", kind: "evm", asset: "USDC" },
  { id: "bitcoin", label: "Bitcoin", kind: "bitcoin", asset: "BTC" },
] as const;

export type ClientNetworkId = (typeof CLIENT_NETWORKS)[number]["id"];
export type OnrampClientNetworkId = (typeof ONRAMP_CLIENT_NETWORKS)[number]["id"];

export function getNetwork(id: string) {
  return CLIENT_NETWORKS.find((n) => n.id === id) ?? null;
}

export function isOnrampClientNetwork(id: string): id is OnrampClientNetworkId {
  return ONRAMP_CLIENT_NETWORKS.some((n) => n.id === id);
}

export function isValidWalletAddress(networkId: string, address: string): boolean {
  const trimmed = address.trim();
  if (!trimmed) return false;
  const net = getNetwork(networkId);
  if (!net) return false;
  if (net.kind === "bitcoin") {
    return /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(trimmed);
  }
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed);
}

/** Inclusive USD bounds for client checkout. */
export const MIN_AMOUNT_USD = 5;
export const MAX_AMOUNT_USD = 9000;
export const MIN_AMOUNT_CENTS = MIN_AMOUNT_USD * 100;
export const MAX_AMOUNT_CENTS = MAX_AMOUNT_USD * 100;

export function parseAmountUsd(input: string | number): number | null {
  const n = typeof input === "number" ? input : Number(String(input).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n)) return null;
  return n;
}

export function amountUsdToCents(usd: number): number {
  return Math.round(usd * 100);
}

export function isValidAmountUsd(usd: number): boolean {
  return usd >= MIN_AMOUNT_USD && usd <= MAX_AMOUNT_USD;
}

export function formatUsd(usd: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: usd % 1 === 0 ? 0 : 2,
  }).format(usd);
}

export function checkoutAmountRangeLabel(): string {
  return `${formatUsd(MIN_AMOUNT_USD)} – ${formatUsd(MAX_AMOUNT_USD)}`;
}
