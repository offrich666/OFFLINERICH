/** Public Instant config — client id only (never ship the secret to the browser). */

export function getThirdwebClientId(): string {
  return (process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "").trim();
}

export const USDC_BY_NETWORK: Record<
  string,
  { chainId: number; tokenAddress: string; label: string }
> = {
  ethereum: {
    chainId: 1,
    tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    label: "Ethereum",
  },
  polygon: {
    chainId: 137,
    tokenAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    label: "Polygon",
  },
  base: {
    chainId: 8453,
    tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    label: "Base",
  },
  bsc: {
    chainId: 56,
    tokenAddress: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    label: "BNB Chain",
  },
};

export const THIRDWEB_INSTANT_NETWORKS = [
  { id: "ethereum", label: "Ethereum", asset: "USDC" },
  { id: "polygon", label: "Polygon", asset: "USDC" },
  { id: "base", label: "Base", asset: "USDC" },
  { id: "bsc", label: "BNB Chain", asset: "USDC" },
] as const;

export type ThirdwebInstantNetworkId =
  (typeof THIRDWEB_INSTANT_NETWORKS)[number]["id"];

export function isThirdwebInstantNetwork(
  id: string,
): id is ThirdwebInstantNetworkId {
  return THIRDWEB_INSTANT_NETWORKS.some((n) => n.id === id);
}

/**
 * On-page Instant buy URL — card only, locked USDC amount → client wallet.
 * Uses bridge/buy-widget (not the Swap bridge/widget that forces provider hops).
 */
export function buildThirdwebInstantEmbedUrl(input: {
  amountUsd: number;
  network: ThirdwebInstantNetworkId;
  walletAddress: string;
}): string {
  const clientId = getThirdwebClientId();
  const asset = USDC_BY_NETWORK[input.network];
  if (!clientId || !asset) {
    throw new Error("Instant is not configured");
  }

  const amount = String(input.amountUsd);
  const params = new URLSearchParams({
    clientId,
    theme: "dark",
    currency: "USD",
    // Card only — no crypto swap / provider picker
    paymentMethods: "card",
    showThirdwebBranding: "false",
    chain: String(asset.chainId),
    tokenAddress: asset.tokenAddress,
    amount,
    amountEditable: "false",
    tokenEditable: "false",
    receiverAddress: input.walletAddress,
    title: "Buy USDC",
    description: `${amount} USDC to your wallet`,
  });

  return `https://thirdweb.com/bridge/buy-widget?${params.toString()}`;
}
