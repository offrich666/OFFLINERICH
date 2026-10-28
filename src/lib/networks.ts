/** Client-facing networks (treasury internals stay server-side). */
export const CLIENT_NETWORKS = [
  { id: "polygon", label: "Polygon", kind: "evm", asset: "USDC" },
  { id: "ethereum", label: "Ethereum", kind: "evm", asset: "USDC" },
  { id: "base", label: "Base", kind: "evm", asset: "USDC" },
  { id: "bsc", label: "BNB Smart Chain (BSC)", kind: "evm", asset: "USDC" },
  { id: "bitcoin", label: "Bitcoin", kind: "bitcoin", asset: "BTC" },
] as const;

export type ClientNetworkId = (typeof CLIENT_NETWORKS)[number]["id"];

export function getNetwork(id: string) {
  return CLIENT_NETWORKS.find((n) => n.id === id) ?? null;
}

export function isValidWalletAddress(networkId: string, address: string): boolean {
  const trimmed = address.trim();
  if (!trimmed) return false;
  const net = getNetwork(networkId);
  if (!net) return false;
  if (net.kind === "bitcoin") {
    // Bech32 / legacy-ish BTC addresses
    return /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(trimmed);
  }
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed);
}

export const CHECKOUT_AMOUNT_CENTS = Number(
  process.env.NEXT_PUBLIC_STRIPE_PRICE_CENTS || "900000",
);

export function checkoutAmountUsdLabel(): string {
  const cents = Number.isFinite(CHECKOUT_AMOUNT_CENTS) ? CHECKOUT_AMOUNT_CENTS : 900000;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
