import { CHAINS, getChain, isEvmAddress } from "./chains";
import type { Address } from "viem";

export type SharedToken = {
  address: Address;
  chainId: number;
  name: string;
  symbol: string;
  /** Prefer https URL — data URLs make share links too long */
  logo: string;
  displayPrice: string;
};

export type TokenState = SharedToken;

const STORAGE_KEY = "relaymark-team-token";

export function loadSavedToken(): TokenState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TokenState;
    if (!parsed?.address || !isEvmAddress(parsed.address)) return null;
    return {
      ...parsed,
      chainId: parsed.chainId || CHAINS[0].id,
      logo: parsed.logo || "",
      displayPrice: parsed.displayPrice || "",
    };
  } catch {
    return null;
  }
}

export function saveToken(token: TokenState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(token));
}

export function buildReceiveShareUrl(token: SharedToken, origin = window.location.origin): string {
  const params = new URLSearchParams();
  params.set("chain", String(token.chainId));
  params.set("token", token.address);
  params.set("symbol", token.symbol);
  params.set("name", token.name);
  if (token.logo && /^https?:\/\//i.test(token.logo)) {
    params.set("logo", token.logo);
  }
  if (token.displayPrice) params.set("price", token.displayPrice);
  return `${origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/#/receive?${params.toString()}`;
}

export function parseReceiveShare(): SharedToken | null {
  const hash = window.location.hash || "";
  const qIndex = hash.indexOf("?");
  if (!hash.startsWith("#/receive")) return null;
  const query = qIndex >= 0 ? hash.slice(qIndex + 1) : "";
  const params = new URLSearchParams(query);
  const address = (params.get("token") || "").trim();
  const chainId = Number(params.get("chain") || "0");
  if (!isEvmAddress(address) || !getChain(chainId)) return null;
  return {
    address: address as Address,
    chainId,
    name: params.get("name")?.trim() || "Team Token",
    symbol: (params.get("symbol")?.trim() || "TOKEN").slice(0, 11).toUpperCase(),
    logo: params.get("logo")?.trim() || "",
    displayPrice: params.get("price")?.trim() || "",
  };
}

export function isReceiveRoute() {
  return (window.location.hash || "").startsWith("#/receive");
}
