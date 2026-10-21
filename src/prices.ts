import type { TokenPrice } from './money.ts';

export type PriceClient = {
  getMany(ids: string[]): Promise<Record<string, TokenPrice | null>>;
};

type LlamaCoin = { price?: number; confidence?: number };

export function createPriceClient(fetchImpl: typeof fetch = fetch): PriceClient {
  const cache = new Map<string, { at: number; value: TokenPrice }>();
  return {
    async getMany(ids: string[]) {
      const now = Date.now();
      const missing = ids.filter((coinId) => {
        const hit = cache.get(coinId);
        return !hit || now - hit.at > 60_000;
      });
      if (missing.length > 0) {
        try {
          const url = `https://coins.llama.fi/prices/current/${missing.join(',')}?searchWidth=4h`;
          const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
          if (!response.ok) throw new Error(`price http ${response.status}`);
          const body = (await response.json()) as { coins?: Record<string, LlamaCoin> };
          const coins = body.coins ?? {};
          const byLower = new Map(Object.entries(coins).map(([key, value]) => [key.toLowerCase(), value]));
          for (const coinId of missing) {
            const row = byLower.get(coinId.toLowerCase());
            if (!row || typeof row.price !== 'number' || row.price <= 0) continue;
            cache.set(coinId, {
              at: now,
              value: {
                price: row.price,
                confidence: typeof row.confidence === 'number' ? row.confidence : 0,
              },
            });
          }
        } catch (error) {
          console.error('price feed failed', error instanceof Error ? error.message : error);
        }
      }
      const out: Record<string, TokenPrice | null> = {};
      for (const coinId of ids) out[coinId] = cache.get(coinId)?.value ?? null;
      return out;
    },
  };
}
