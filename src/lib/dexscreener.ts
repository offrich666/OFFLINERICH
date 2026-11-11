export type TxnBucket = { buys: number; sells: number };

export type DexPair = {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  labels?: string[] | null;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceNative: string;
  priceUsd?: string | null;
  txns?: Record<string, TxnBucket>;
  volume?: Record<string, number>;
  priceChange?: Record<string, number> | null;
  liquidity?: { usd?: number | null; base?: number; quote?: number } | null;
  fdv?: number | null;
  marketCap?: number | null;
  pairCreatedAt?: number | null;
  info?: {
    imageUrl?: string | null;
    header?: string | null;
    openGraph?: string | null;
  };
  boosts?: { active?: number };
};

export type TokenBoost = {
  url: string;
  chainId: string;
  tokenAddress: string;
  description?: string | null;
  icon?: string | null;
  header?: string | null;
  openGraph?: string | null;
  totalAmount?: number;
};

export type ScreenerToken = {
  id: string;
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  labels: string[];
  name: string;
  symbol: string;
  quoteSymbol: string;
  tokenAddress: string;
  imageUrl: string | null;
  priceUsd: number | null;
  txns24h: number;
  volume24h: number;
  change5m: number | null;
  change1h: number | null;
  change6h: number | null;
  change24h: number | null;
  liquidityUsd: number | null;
  fdv: number | null;
  marketCap: number | null;
  ageMs: number | null;
  boostAmount: number;
};

const DEX_API = "https://api.dexscreener.com";

async function dexFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${DEX_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    next: { revalidate: 20 },
  });
  if (!res.ok) {
    throw new Error(`DexScreener ${path} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

function txnTotal(bucket?: TxnBucket): number {
  if (!bucket) return 0;
  return (bucket.buys ?? 0) + (bucket.sells ?? 0);
}

function normalizeIcon(icon?: string | null): string | null {
  if (!icon) return null;
  if (icon.startsWith("http")) return icon;
  return `https://cdn.dexscreener.com/cms/images/${icon}`;
}

export function pairToScreenerToken(
  pair: DexPair,
  boostAmount = 0,
): ScreenerToken {
  const created = pair.pairCreatedAt ?? null;
  return {
    id: `${pair.chainId}:${pair.pairAddress}`,
    chainId: pair.chainId,
    dexId: pair.dexId,
    url: pair.url,
    pairAddress: pair.pairAddress,
    labels: pair.labels ?? [],
    name: pair.baseToken.name,
    symbol: pair.baseToken.symbol,
    quoteSymbol: pair.quoteToken.symbol,
    tokenAddress: pair.baseToken.address,
    imageUrl: pair.info?.imageUrl ?? null,
    priceUsd: pair.priceUsd != null ? Number(pair.priceUsd) : null,
    txns24h: txnTotal(pair.txns?.h24),
    volume24h: pair.volume?.h24 ?? 0,
    change5m: pair.priceChange?.m5 ?? null,
    change1h: pair.priceChange?.h1 ?? null,
    change6h: pair.priceChange?.h6 ?? null,
    change24h: pair.priceChange?.h24 ?? null,
    liquidityUsd: pair.liquidity?.usd ?? null,
    fdv: pair.fdv ?? null,
    marketCap: pair.marketCap ?? null,
    ageMs: created != null ? Date.now() - created : null,
    boostAmount,
  };
}

function pickBestPair(pairs: DexPair[]): DexPair | null {
  if (!pairs.length) return null;
  return [...pairs].sort((a, b) => {
    const liqA = a.liquidity?.usd ?? 0;
    const liqB = b.liquidity?.usd ?? 0;
    if (liqB !== liqA) return liqB - liqA;
    return (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0);
  })[0];
}

export async function fetchTopBoosts(): Promise<TokenBoost[]> {
  const data = await dexFetch<TokenBoost[]>("/token-boosts/top/v1");
  return Array.isArray(data) ? data : [];
}

export async function fetchPairsForTokens(
  chainId: string,
  tokenAddresses: string[],
): Promise<DexPair[]> {
  if (!tokenAddresses.length) return [];
  const unique = [...new Set(tokenAddresses)].slice(0, 30);
  const data = await dexFetch<DexPair[]>(
    `/tokens/v1/${encodeURIComponent(chainId)}/${unique.join(",")}`,
  );
  return Array.isArray(data) ? data : [];
}

export async function searchPairs(query: string): Promise<DexPair[]> {
  const q = query.trim();
  if (!q) return [];
  const data = await dexFetch<{ pairs?: DexPair[] }>(
    `/latest/dex/search?q=${encodeURIComponent(q)}`,
  );
  return Array.isArray(data.pairs) ? data.pairs : [];
}

export async function loadBoostedScreenerTokens(): Promise<ScreenerToken[]> {
  const boosts = await fetchTopBoosts();
  const byChain = new Map<string, TokenBoost[]>();
  for (const boost of boosts.slice(0, 40)) {
    const list = byChain.get(boost.chainId) ?? [];
    list.push(boost);
    byChain.set(boost.chainId, list);
  }

  const boostMap = new Map<string, number>();
  for (const boost of boosts) {
    const key = `${boost.chainId}:${boost.tokenAddress}`.toLowerCase();
    boostMap.set(
      key,
      Math.max(boostMap.get(key) ?? 0, boost.totalAmount ?? 0),
    );
  }

  const pairBatches = await Promise.all(
    [...byChain.entries()].map(async ([chainId, chainBoosts]) => {
      const addresses = chainBoosts.map((b) => b.tokenAddress);
      const pairs = await fetchPairsForTokens(chainId, addresses);
      return { chainId, pairs, chainBoosts };
    }),
  );

  const bestByToken = new Map<string, DexPair>();
  for (const { pairs } of pairBatches) {
    const grouped = new Map<string, DexPair[]>();
    for (const pair of pairs) {
      const key = `${pair.chainId}:${pair.baseToken.address}`.toLowerCase();
      const list = grouped.get(key) ?? [];
      list.push(pair);
      grouped.set(key, list);
    }
    for (const [key, group] of grouped) {
      const best = pickBestPair(group);
      if (best) bestByToken.set(key, best);
    }
  }

  const tokens: ScreenerToken[] = [];
  for (const boost of boosts.slice(0, 40)) {
    const key = `${boost.chainId}:${boost.tokenAddress}`.toLowerCase();
    const pair = bestByToken.get(key);
    if (!pair) continue;
    const token = pairToScreenerToken(pair, boostMap.get(key) ?? 0);
    if (!token.imageUrl) {
      token.imageUrl = normalizeIcon(boost.icon);
    }
    tokens.push(token);
  }

  return tokens;
}

export async function loadSearchScreenerTokens(
  query: string,
): Promise<ScreenerToken[]> {
  const pairs = await searchPairs(query);
  const seen = new Set<string>();
  const tokens: ScreenerToken[] = [];
  for (const pair of pairs) {
    const key = `${pair.chainId}:${pair.baseToken.address}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push(pairToScreenerToken(pair));
    if (tokens.length >= 50) break;
  }
  return tokens;
}

export function formatUsd(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (abs >= 1) return `$${value.toFixed(2)}`;
  if (abs >= 0.0001) return `$${value.toPrecision(4)}`;
  return `$${value.toExponential(2)}`;
}

export function formatPrice(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (value >= 1) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
  if (value >= 0.0001) return `$${value.toPrecision(4)}`;
  const fixed = value.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
  return `$${fixed}`;
}

export function formatPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatAge(ageMs: number | null | undefined): string {
  if (ageMs == null || ageMs < 0) return "—";
  const mins = Math.floor(ageMs / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

export function formatCount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}
