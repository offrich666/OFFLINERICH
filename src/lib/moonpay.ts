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
