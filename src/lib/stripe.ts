import "server-only";
import Stripe from "stripe";
import {
  ONRAMP_CURRENCIES,
  ONRAMP_NETWORKS,
  defaultOnrampAmountUsd,
  treasuryWalletAddresses,
  type OnrampCurrency,
  type OnrampNetwork,
} from "@/lib/treasury";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  if (!stripeClient) {
    stripeClient = new Stripe(key, {
      apiVersion: "2026-09-30.endive",
      typescript: true,
      appInfo: {
        name: "OFFLINERICH",
        version: "0.1.0",
      },
    });
  }
  return stripeClient;
}

export function getStripePriceId(): string {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    throw new Error("STRIPE_PRICE_ID is not set");
  }
  return priceId;
}

export function getPublishableKey(): string {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
}

export function isLiveStripeKey(key = process.env.STRIPE_SECRET_KEY || ""): boolean {
  return key.includes("_live_") || key.startsWith("rk_live") || key.startsWith("sk_live");
}

export function getAppOrigin(request?: Request): string {
  if (request) {
    const origin = request.headers.get("origin");
    if (origin) return origin;
    const host =
      request.headers.get("x-forwarded-host") || request.headers.get("host");
    const proto = request.headers.get("x-forwarded-proto") || "http";
    if (host) return `${proto}://${host}`;
  }
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export function checkoutIntegrationId(): string {
  const suffix = Math.random().toString(36).slice(2, 10);
  return `offlinerich_emb_${suffix}`;
}

export function getLivePaymentLinkUrl(): string {
  return (
    process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK_URL ||
    "https://buy.stripe.com/eVq8wReu5cHm8WA8crds406"
  );
}

type CreateOnrampInput = {
  customerIpAddress?: string;
  sourceAmountUsd?: string;
  destinationNetwork?: OnrampNetwork;
  destinationCurrency?: OnrampCurrency;
};

/**
 * Mint a Crypto Onramp session that locks delivery to OFFLINERICH treasury.
 * Uses Stripe preview Onramp API via rawRequest.
 */
export async function createTreasuryOnrampSession(input: CreateOnrampInput = {}) {
  const stripe = getStripe();
  const sourceAmount = input.sourceAmountUsd || defaultOnrampAmountUsd();
  const destinationNetwork = input.destinationNetwork || "polygon";
  const destinationCurrency = input.destinationCurrency || "usdc";

  const params: Record<string, unknown> = {
    source_currency: "usd",
    source_amount: sourceAmount,
    destination_currency: destinationCurrency,
    destination_network: destinationNetwork,
    destination_currencies: [...ONRAMP_CURRENCIES],
    destination_networks: [...ONRAMP_NETWORKS],
    lock_wallet_address: true,
    wallet_addresses: treasuryWalletAddresses(),
    metadata: {
      project: "offlinerich",
      flow: "treasury_onramp",
      treasury_evm: treasuryWalletAddresses().ethereum,
      treasury_btc: treasuryWalletAddresses().bitcoin,
    },
  };

  if (input.customerIpAddress) {
    params.customer_ip_address = input.customerIpAddress;
  }

  // Preview API — not in the typed SDK surface yet.
  const session = await stripe.rawRequest(
    "POST",
    "/v1/crypto/onramp_sessions",
    params,
  );

  return session as {
    id: string;
    client_secret: string;
    status: string;
    redirect_url?: string | null;
    livemode?: boolean;
  };
}
