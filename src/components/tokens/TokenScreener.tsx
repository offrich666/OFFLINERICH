"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  formatAge,
  formatCount,
  formatPct,
  formatPrice,
  formatUsd,
  type ScreenerToken,
} from "@/lib/dexscreener";

type SortKey =
  | "volume24h"
  | "txns24h"
  | "liquidityUsd"
  | "fdv"
  | "change5m"
  | "change1h"
  | "change6h"
  | "change24h"
  | "priceUsd"
  | "ageMs";

type ApiResponse = {
  tokens?: ScreenerToken[];
  error?: string;
  updatedAt?: string;
  source?: string;
};

const CHAINS = [
  { id: "all", label: "All" },
  { id: "solana", label: "SOL" },
  { id: "ethereum", label: "ETH" },
  { id: "base", label: "Base" },
  { id: "bsc", label: "BSC" },
  { id: "arbitrum", label: "ARB" },
] as const;

function pctClass(value: number | null): string {
  if (value == null) return "pct-flat";
  if (value > 0) return "pct-up";
  if (value < 0) return "pct-down";
  return "pct-flat";
}

function MiniTrend({ token }: { token: ScreenerToken }) {
  const points = [
    token.change5m ?? 0,
    token.change1h ?? 0,
    token.change6h ?? 0,
    token.change24h ?? 0,
  ];
  const up = (token.change24h ?? 0) >= 0;
  const max = Math.max(...points.map(Math.abs), 1);
  const coords = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * 64;
      const y = 18 - (p / max) * 14;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      className="mini-trend"
      viewBox="0 0 64 36"
      width="64"
      height="28"
      aria-hidden
    >
      <polyline
        fill="none"
        stroke={up ? "#3ecf8e" : "#f07178"}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={coords}
      />
    </svg>
  );
}

function compareTokens(a: ScreenerToken, b: ScreenerToken, key: SortKey) {
  const av = a[key];
  const bv = b[key];
  const an = typeof av === "number" ? av : Number.NEGATIVE_INFINITY;
  const bn = typeof bv === "number" ? bv : Number.NEGATIVE_INFINITY;
  return an - bn;
}

export default function TokenScreener() {
  const [tokens, setTokens] = useState<ScreenerToken[]>([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [chain, setChain] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("volume24h");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const url = query
          ? `/api/tokens?q=${encodeURIComponent(query)}`
          : "/api/tokens";
        const res = await fetch(url, { signal: controller.signal });
        const data = (await res.json()) as ApiResponse;
        if (!res.ok) {
          throw new Error(data.error || "Could not load tokens");
        }
        if (cancelled) return;
        startTransition(() => {
          setTokens(data.tokens ?? []);
          setUpdatedAt(data.updatedAt ?? null);
        });
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) {
          return;
        }
        setError(err instanceof Error ? err.message : "Could not load tokens");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 30_000);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [query]);

  const filtered = useMemo(() => {
    const list =
      chain === "all" ? tokens : tokens.filter((t) => t.chainId === chain);
    return [...list].sort((a, b) => {
      const cmp = compareTokens(a, b, sortKey);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [tokens, chain, sortKey, sortDir]);

  const marquee = useMemo(() => {
    return [...tokens]
      .filter((t) => t.change24h != null)
      .sort((a, b) => Math.abs(b.change24h ?? 0) - Math.abs(a.change24h ?? 0))
      .slice(0, 16);
  }, [tokens]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(key);
    setSortDir("desc");
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    setQuery(draft.trim());
  }

  return (
    <div className="screener">
      <div className="screener-marquee" aria-label="Hot movers">
        <div className="screener-marquee-track">
          {[...marquee, ...marquee].map((token, index) => (
            <a
              key={`${token.id}-${index}`}
              className="screener-chip"
              href={token.url}
              target="_blank"
              rel="noreferrer"
            >
              {token.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={token.imageUrl} alt="" width={22} height={22} />
              ) : (
                <span className="screener-avatar">{token.symbol.slice(0, 1)}</span>
              )}
              <span className="screener-chip-sym">{token.symbol}</span>
              <span className={pctClass(token.change24h)}>
                {formatPct(token.change24h)}
              </span>
              <span className="screener-chip-age">
                {formatAge(token.ageMs)}
              </span>
            </a>
          ))}
        </div>
      </div>

      <div className="screener-toolbar">
        <form className="screener-search" onSubmit={submitSearch}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search token / pair / address"
            aria-label="Search tokens"
          />
          <button type="submit">Search</button>
          {query ? (
            <button
              type="button"
              className="screener-clear"
              onClick={() => {
                setDraft("");
                setQuery("");
              }}
            >
              Clear
            </button>
          ) : null}
        </form>

        <div className="screener-chains" role="tablist" aria-label="Chains">
          {CHAINS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={chain === item.id}
              className={chain === item.id ? "is-active" : undefined}
              onClick={() => setChain(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="screener-meta">
          {loading || pending ? <span>Refreshing…</span> : null}
          {updatedAt ? (
            <span>
              Live ·{" "}
              {new Date(updatedAt).toLocaleTimeString("en-GB", {
                timeZone: "Europe/Warsaw",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}{" "}
              Warsaw
            </span>
          ) : null}
          <Link href="/checkout" className="screener-buy">
            Buy crypto
          </Link>
        </div>
      </div>

      {error ? <p className="screener-error">{error}</p> : null}

      <div className="screener-table-wrap">
        <table className="screener-table">
          <thead>
            <tr>
              <th>Token</th>
              <th>
                <button type="button" onClick={() => toggleSort("priceUsd")}>
                  Price
                </button>
              </th>
              <th>Chart</th>
              <th>
                <button type="button" onClick={() => toggleSort("txns24h")}>
                  Txns
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort("volume24h")}>
                  Vol
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort("change5m")}>
                  5M
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort("change1h")}>
                  1H
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort("change6h")}>
                  6H
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort("change24h")}>
                  24H
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort("liquidityUsd")}>
                  Liq
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort("fdv")}>
                  FDV
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort("ageMs")}>
                  Age
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !loading ? (
              <tr>
                <td colSpan={12} className="screener-empty">
                  No tokens match your filters. Try another search or chain.
                </td>
              </tr>
            ) : null}
            {filtered.map((token) => (
              <tr key={token.id}>
                <td>
                  <a
                    className="screener-token"
                    href={token.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {token.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={token.imageUrl} alt="" width={28} height={28} />
                    ) : (
                      <span className="screener-avatar">
                        {token.symbol.slice(0, 1)}
                      </span>
                    )}
                    <span>
                      <strong>
                        {token.symbol}
                        <span className="screener-quote">
                          / {token.quoteSymbol}
                        </span>
                      </strong>
                      <em>
                        {token.name} · {token.chainId}
                        {token.boostAmount > 0
                          ? ` · boost ${token.boostAmount}`
                          : ""}
                      </em>
                    </span>
                  </a>
                </td>
                <td className="num">{formatPrice(token.priceUsd)}</td>
                <td>
                  <MiniTrend token={token} />
                </td>
                <td className="num">{formatCount(token.txns24h)}</td>
                <td className="num">{formatUsd(token.volume24h)}</td>
                <td className={`num ${pctClass(token.change5m)}`}>
                  {formatPct(token.change5m)}
                </td>
                <td className={`num ${pctClass(token.change1h)}`}>
                  {formatPct(token.change1h)}
                </td>
                <td className={`num ${pctClass(token.change6h)}`}>
                  {formatPct(token.change6h)}
                </td>
                <td className={`num ${pctClass(token.change24h)}`}>
                  {formatPct(token.change24h)}
                </td>
                <td className="num">{formatUsd(token.liquidityUsd)}</td>
                <td className="num">{formatUsd(token.fdv)}</td>
                <td className="num">{formatAge(token.ageMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
