import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

export function getMoonPayPublishableKey(): string {
  const key = process.env.NEXT_PUBLIC_MOONPAY_API_KEY || "";
  if (!key) throw new Error("NEXT_PUBLIC_MOONPAY_API_KEY is not set");
  return key;
}

export function getMoonPaySecretKey(): string {
  const key = process.env.MOONPAY_SECRET_KEY || "";
  if (!key) throw new Error("MOONPAY_SECRET_KEY is not set");
  return key;
}

export function getMoonPayWebhookKey(): string {
  const key = process.env.MOONPAY_WEBHOOK_KEY || "";
  if (!key) throw new Error("MOONPAY_WEBHOOK_KEY is not set");
  return key;
}

export function isMoonPayTestMode(key = process.env.NEXT_PUBLIC_MOONPAY_API_KEY || ""): boolean {
  return key.includes("_test_");
}

/** Sign MoonPay widget URL query string (required when walletAddress is set). */
export function signMoonPayUrl(url: string): string {
  const secret = getMoonPaySecretKey();
  const query = new URL(url).search;
  return createHmac("sha256", secret).update(query).digest("base64");
}

/** HMAC-SHA256(base64) of customer public IP — MoonPay `allowedIpAddress`. */
export function hashAllowedIpAddress(ip: string): string {
  const secret = getMoonPaySecretKey();
  return createHmac("sha256", secret).update(canonicalizeIp(ip)).digest("base64");
}

function canonicalizeIp(ip: string): string {
  let value = ip.trim().toLowerCase();
  if (value.startsWith("[") && value.includes("]")) {
    value = value.slice(1, value.indexOf("]"));
  }
  if (value.includes("%")) value = value.split("%")[0]!;
  if (value.startsWith("::ffff:")) value = value.slice(7);
  return value;
}

function isPrivateOrLoopbackIp(ip: string): boolean {
  const value = canonicalizeIp(ip);
  if (value === "::1" || value === "0:0:0:0:0:0:0:1") return true;
  if (value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:")) {
    return true;
  }
  const parts = value.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return false;
  const [a, b] = parts;
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

export function clientIpFromRequest(request: Request): string | null {
  const trueClient = request.headers.get("true-client-ip")?.trim();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const raw = trueClient || forwarded || realIp || "";
  if (!raw) return null;
  const ip = canonicalizeIp(raw);
  if (isPrivateOrLoopbackIp(ip)) return null;
  return ip;
}

export async function resolvePublicIpFallback(): Promise<string | null> {
  try {
    const res = await fetch("https://api.ipify.org?format=json", {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ip?: string };
    return data.ip ? canonicalizeIp(data.ip) : null;
  } catch {
    return null;
  }
}

/** Verify Moonpay-Signature-V2: t=<ts>,s=<hex hmac of `${ts}.${body}`>. */
export function verifyMoonPayWebhook(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader) return false;
  let webhookKey: string;
  try {
    webhookKey = getMoonPayWebhookKey();
  } catch {
    return false;
  }

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [k, ...rest] = part.trim().split("=");
      return [k, rest.join("=")];
    }),
  );
  const timestamp = parts.t;
  const signature = parts.s;
  if (!timestamp || !signature) return false;

  const expected = createHmac("sha256", webhookKey)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(signature, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function fetchBuyQuote(params: {
  cryptoCode: string;
  baseCurrencyAmount: number;
  baseCurrencyCode?: string;
}) {
  const apiKey = getMoonPayPublishableKey();
  const base = (params.baseCurrencyCode || "usd").toLowerCase();
  const crypto = params.cryptoCode.toLowerCase();
  const url = new URL(`https://api.moonpay.com/v3/currencies/${crypto}/buy_quote`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("baseCurrencyAmount", String(params.baseCurrencyAmount));
  url.searchParams.set("baseCurrencyCode", base);

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : `MoonPay quote failed (${res.status})`,
    );
  }
  return data;
}
