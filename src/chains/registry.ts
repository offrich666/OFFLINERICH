export type ChainKind = "solana" | "evm";

export type ChainDef = {
  id: string;
  kind: ChainKind;
  name: string;
  chainId?: number;
  nativeSymbol: string;
  decimals: number;
  /** Public RPC — override with RPC_URL_<CHAIN> */
  defaultRpc: string;
  /** Native token address for aggregators */
  nativeToken: string;
};

/** Personal sniper chain catalog. Add RPCs in .env as needed. */
export const CHAINS: Record<string, ChainDef> = {
  solana: {
    id: "solana",
    kind: "solana",
    name: "Solana",
    nativeSymbol: "SOL",
    decimals: 9,
    defaultRpc: "https://api.mainnet-beta.solana.com",
    nativeToken: "So11111111111111111111111111111111111111112",
  },
  ethereum: {
    id: "ethereum",
    kind: "evm",
    name: "Ethereum",
    chainId: 1,
    nativeSymbol: "ETH",
    decimals: 18,
    defaultRpc: "https://ethereum.publicnode.com",
    nativeToken: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  },
  base: {
    id: "base",
    kind: "evm",
    name: "Base",
    chainId: 8453,
    nativeSymbol: "ETH",
    decimals: 18,
    defaultRpc: "https://base.publicnode.com",
    nativeToken: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  },
  bsc: {
    id: "bsc",
    kind: "evm",
    name: "BNB Smart Chain",
    chainId: 56,
    nativeSymbol: "BNB",
    decimals: 18,
    defaultRpc: "https://bsc.publicnode.com",
    nativeToken: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  },
  arbitrum: {
    id: "arbitrum",
    kind: "evm",
    name: "Arbitrum One",
    chainId: 42161,
    nativeSymbol: "ETH",
    decimals: 18,
    defaultRpc: "https://arbitrum-one.publicnode.com",
    nativeToken: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  },
  polygon: {
    id: "polygon",
    kind: "evm",
    name: "Polygon",
    chainId: 137,
    nativeSymbol: "POL",
    decimals: 18,
    defaultRpc: "https://polygon-bor.publicnode.com",
    nativeToken: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  },
  optimism: {
    id: "optimism",
    kind: "evm",
    name: "Optimism",
    chainId: 10,
    nativeSymbol: "ETH",
    decimals: 18,
    defaultRpc: "https://optimism.publicnode.com",
    nativeToken: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  },
  avalanche: {
    id: "avalanche",
    kind: "evm",
    name: "Avalanche C-Chain",
    chainId: 43114,
    nativeSymbol: "AVAX",
    decimals: 18,
    defaultRpc: "https://avalanche-c-chain-rpc.publicnode.com",
    nativeToken: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  },
};

export function resolveChain(id: string): ChainDef {
  const key = id.trim().toLowerCase();
  const aliases: Record<string, string> = {
    eth: "ethereum",
    sol: "solana",
    arb: "arbitrum",
    matic: "polygon",
    avax: "avalanche",
    op: "optimism",
  };
  const resolved = aliases[key] ?? key;
  const chain = CHAINS[resolved];
  if (!chain) {
    throw new Error(
      `Unknown chain "${id}". Supported: ${Object.keys(CHAINS).join(", ")}`
    );
  }
  return chain;
}

export function rpcFor(chain: ChainDef, env: NodeJS.ProcessEnv = process.env): string {
  const specific =
    env[`RPC_URL_${chain.id.toUpperCase()}`] ||
    env[`RPC_${chain.id.toUpperCase()}`];
  if (specific?.trim()) return specific.trim();
  if (env.RPC_URL?.trim() && chain.kind === "solana") return env.RPC_URL.trim();
  return chain.defaultRpc;
}

export function listChains(): ChainDef[] {
  return Object.values(CHAINS);
}