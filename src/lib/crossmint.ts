const DEFAULT_API_BASE = "https://www.crossmint.com/api/2022-06-09";

export function getCrossmintApiBase() {
  return process.env.CROSSMINT_API_BASE?.replace(/\/$/, "") || DEFAULT_API_BASE;
}

export function getServerApiKey() {
  const key = process.env.CROSSMINT_SERVER_API_KEY;
  if (!key) {
    throw new Error("CROSSMINT_SERVER_API_KEY is not set");
  }
  return key;
}

export function getClientApiKey() {
  return process.env.NEXT_PUBLIC_CROSSMINT_API_KEY ?? "";
}

export function getCollectionId() {
  return process.env.NEXT_PUBLIC_CROSSMINT_COLLECTION_ID ?? "";
}

export function getCheckoutPrice() {
  return process.env.NEXT_PUBLIC_CROSSMINT_PRICE ?? "1";
}

export async function crossmintFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: T }> {
  const url = `${getCrossmintApiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("X-API-KEY", getServerApiKey());
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...init, headers });
  const text = await response.text();
  let data: T;
  try {
    data = text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    data = { message: text } as T;
  }

  return { ok: response.ok, status: response.status, data };
}
