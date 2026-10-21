export type Chain = {
  id: number;
  key: string;
  name: string;
  rpc: string;
  explorer: string;
};

export const CHAINS: Chain[] = [
  { id: 1, key: 'ethereum', name: 'Ethereum', rpc: 'https://ethereum.publicnode.com', explorer: 'https://etherscan.io' },
  { id: 8453, key: 'base', name: 'Base', rpc: 'https://mainnet.base.org', explorer: 'https://basescan.org' },
  { id: 137, key: 'polygon', name: 'Polygon', rpc: 'https://polygon-bor-rpc.publicnode.com', explorer: 'https://polygonscan.com' },
  { id: 42161, key: 'arbitrum', name: 'Arbitrum', rpc: 'https://arbitrum-one.publicnode.com', explorer: 'https://arbiscan.io' },
  { id: 10, key: 'optimism', name: 'Optimism', rpc: 'https://mainnet.optimism.io', explorer: 'https://optimistic.etherscan.io' },
  { id: 56, key: 'bsc', name: 'BNB Chain', rpc: 'https://bsc-dataseed.binance.org', explorer: 'https://bscscan.com' },
];

export function chainById(id: number): Chain | undefined {
  return CHAINS.find((chain) => chain.id === id);
}

export type CatalogToken = {
  id: string;
  chainId: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  pegged: boolean;
};

function catalogId(chainId: number, address: string): string {
  return `catalog_${chainId}_${address.slice(2)}`;
}

function token(
  chainId: number,
  address: string,
  symbol: string,
  name: string,
  decimals: number,
  pegged: boolean,
): CatalogToken {
  const normalized = address.toLowerCase();
  return { id: catalogId(chainId, normalized), chainId, address: normalized, symbol, name, decimals, pegged };
}

export const CATALOG: CatalogToken[] = [
  token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'USDC', 'USD Coin', 6, true),
  token(1, '0xdAC17F958D2ee523a2206206994597C13D831ec7', 'USDT', 'Tether USD', 6, true),
  token(1, '0x0f1b825a734Bd1b885EC82780189F4534b291A28', 'LFUSD', 'Luminex Defi Finance', 18, true),
  token(1, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 'DAI', 'Dai', 18, true),
  token(1, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 'WETH', 'Wrapped Ether', 18, false),
  token(8453, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 'USDC', 'USD Coin', 6, true),
  token(8453, '0x4200000000000000000000000000000000000006', 'WETH', 'Wrapped Ether', 18, false),
  token(137, '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', 'USDC', 'USD Coin', 6, true),
  token(137, '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', 'USDT', 'Tether USD', 6, true),
  token(137, '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', 'WETH', 'Wrapped Ether', 18, false),
  token(42161, '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', 'USDC', 'USD Coin', 6, true),
  token(42161, '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', 'WETH', 'Wrapped Ether', 18, false),
  token(10, '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', 'USDC', 'USD Coin', 6, true),
  token(10, '0x4200000000000000000000000000000000000006', 'WETH', 'Wrapped Ether', 18, false),
  token(56, '0x55d398326f99059fF775485246999027B3197955', 'USDT', 'Tether USD', 18, true),
  token(56, '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', 'WBNB', 'Wrapped BNB', 18, false),
];

export function findCatalog(chainId: number, address: string): CatalogToken | undefined {
  const normalized = address.toLowerCase();
  return CATALOG.find((entry) => entry.chainId === chainId && entry.address === normalized);
}

export function findCatalogById(id: string): CatalogToken | undefined {
  return CATALOG.find((entry) => entry.id === id);
}
