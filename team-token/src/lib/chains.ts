export type ChainOption = {
  id: number;
  key: string;
  label: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorerUrls?: string[];
};

/** Live EVM networks only (no testnets). TRON is not supported. */
export const DEFAULT_CHAIN_ID = 1;

export const CHAINS: ChainOption[] = [
  {
    id: 1,
    key: "ethereum",
    label: "Ethereum",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://ethereum.publicnode.com"],
    blockExplorerUrls: ["https://etherscan.io"],
  },
  {
    id: 137,
    key: "polygon",
    label: "Polygon",
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
    rpcUrls: ["https://polygon-bor.publicnode.com"],
    blockExplorerUrls: ["https://polygonscan.com"],
  },
  {
    id: 8453,
    key: "base",
    label: "Base",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://base.publicnode.com"],
    blockExplorerUrls: ["https://basescan.org"],
  },
  {
    id: 56,
    key: "bsc",
    label: "BNB Smart Chain",
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    rpcUrls: ["https://bsc.publicnode.com"],
    blockExplorerUrls: ["https://bscscan.com"],
  },
];

export function getChain(id: number) {
  return CHAINS.find((c) => c.id === id) ?? null;
}

export function isSupportedLiveChain(id: number) {
  return CHAINS.some((c) => c.id === id);
}

export function isTronAddress(value: string) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value.trim());
}

export function isEvmAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}
