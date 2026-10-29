import "server-only";
import Stripe from "stripe";
import {
  ONRAMP_CURRENCIES,
  ONRAMP_NETWORKS,
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
  // Keep in sync with src/lib/stripePublic.ts (server bundle cannot import
  // a client-only pattern change without pulling RSC boundaries oddly).
  const FALLBACK =
    "pk_live_51UCk64QWCzdANStkTBzLbv5xmNgSPXWGkyaW3L8YUP8REGl0oiciJ7VboIB12HxjN8563IP295CrI9g3n2wTxg7Y00BLtQlcAB";
  const BAD =
    "pk_live_51UCk64QWCzdANStkTBzLbV5xmNgSPXWGkyaW3L8YUP8REGloiciJ7VboIB12HxjN8563IP295CrI9g3n2wTxg7Y00BLtQlcAB";
  const fromEnv = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || "";
  if (
    fromEnv.startsWith("pk_") &&
    fromEnv.length >= 107 &&
    fromEnv !== BAD &&
    !fromEnv.includes("placeholder")
  ) {
    return fromEnv;
  }
  return FALLBACK;
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
    "https://buy.stripe.com/aFafZj4TvdLq8WAboDds408"
  );
}

/**
 * Map client delivery network → Onramp network that funds treasury.
 * EU Onramp: USDC/ETH settle on ethereum; BTC on bitcoin.
 * Polygon/Base/BSC clients still get delivery later from the same EVM treasury.
 */
export function onrampNetworkForClientNetwork(
  clientNetwork: string,
): OnrampNetwork {
  if (clientNetwork === "bitcoin") return "bitcoin";
  return "ethereum";
}

export function onrampCurrencyForNetwork(network: OnrampNetwork): OnrampCurrency {
  return network === "bitcoin" ? "btc" : "usdc";
}

type CreateOnrampInput = {
  customerIpAddress?: string;
  sourceAmountUsd: string;
  clientNetwork: string;
  clientWallet: string;
  clientAsset: string;
};

/**
 * Mint Crypto Onramp session: client pays fiat → crypto locked to OUR treasury.
 * Client wallet is stored in metadata for the later treasury→client send.
 */
export async function createTreasuryOnrampSession(input: CreateOnrampInput) {
  const stripe = getStripe();
  const destinationNetwork = onrampNetworkForClientNetwork(input.clientNetwork);
  const destinationCurrency = onrampCurrencyForNetwork(destinationNetwork);
  const wallets = treasuryWalletAddresses();

  const params: Record<string, unknown> = {
    source_currency: "usd",
    source_amount: input.sourceAmountUsd,
    destination_currency: destinationCurrency,
    destination_network: destinationNetwork,
    destination_currencies: [...ONRAMP_CURRENCIES],
    destination_networks: [...ONRAMP_NETWORKS],
    lock_wallet_address: true,
    wallet_addresses: wallets,
    metadata: {
      project: "offlinerich",
      flow: "pay_to_treasury_then_client",
      client_network: input.clientNetwork,
      client_wallet: input.clientWallet,
      client_asset: input.clientAsset,
      onramp_network: destinationNetwork,
      onramp_currency: destinationCurrency,
      treasury_evm: wallets.ethereum,
      treasury_btc: wallets.bitcoin,
      eu_note: "settle_on_ethereum_or_bitcoin",
    },
  };

  if (input.customerIpAddress) {
    params.customer_ip_address = input.customerIpAddress;
  }

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
