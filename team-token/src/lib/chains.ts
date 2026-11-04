import { mainnet, polygon, base, bsc, type Chain } from "viem/chains";

export type ChainOption = {
  id: number;
  key: string;
  label: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorerUrls?: string[];
  viem: Chain;
};

/** Live EVM networks for this ERC-20 desk (no testnets). MetaMask also holds TRON in-wallet separately. */
export const DEFAULT_CHAIN_ID = 1;

export const CHAINS: ChainOption[] = [
  {
    id: mainnet.id,
    key: "ethereum",
    label: "Ethereum",
    nativeCurrency: mainnet.nativeCurrency,
    rpcUrls: [mainnet.rpcUrls.default.http[0] ?? "https://ethereum.publicnode.com"],
    blockExplorerUrls: [mainnet.blockExplorers?.default.url ?? "https://etherscan.io"],
    viem: mainnet,
  },
  {
    id: polygon.id,
    key: "polygon",
    label: "Polygon",
    nativeCurrency: polygon.nativeCurrency,
    rpcUrls: [polygon.rpcUrls.default.http[0] ?? "https://polygon-bor.publicnode.com"],
    blockExplorerUrls: [polygon.blockExplorers?.default.url ?? "https://polygonscan.com"],
    viem: polygon,
  },
  {
    id: base.id,
    key: "base",
    label: "Base",
    nativeCurrency: base.nativeCurrency,
    rpcUrls: [base.rpcUrls.default.http[0] ?? "https://base.publicnode.com"],
    blockExplorerUrls: [base.blockExplorers?.default.url ?? "https://basescan.org"],
    viem: base,
  },
  {
    id: bsc.id,
    key: "bsc",
    label: "BNB Smart Chain",
    nativeCurrency: bsc.nativeCurrency,
    rpcUrls: [bsc.rpcUrls.default.http[0] ?? "https://bsc.publicnode.com"],
    blockExplorerUrls: [bsc.blockExplorers?.default.url ?? "https://bscscan.com"],
    viem: bsc,
  },
];

export function getChain(id: number) {
  return CHAINS.find((c) => c.id === id) ?? null;
}

export function getViemChain(id: number): Chain {
  return getChain(id)?.viem ?? mainnet;
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
