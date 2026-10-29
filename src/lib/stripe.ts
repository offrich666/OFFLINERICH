import "server-only";
import Stripe from "stripe";
import {
  ONRAMP_CURRENCIES,
  ONRAMP_NETWORKS,
  treasuryWalletAddresses,
  type OnrampCurrency,
  type OnrampNetwork,
} from "@/lib/treasury";
import { getStripePublishableKey } from "@/lib/stripePublic";

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
  return getStripePublishableKey();
}

export function isLiveStripeKey(key = process.env.STRIPE_SECRET_KEY || ""): boolean {
  return key.includes("_live_") || key.startsWith("rk_live") || key.startsWith("sk_live");
}

export function getAppOrigin(request?: Request): string {
  if (request) {
    const origin = request.headers.get("origin");
    if (origin) return origin;
    try {
      return new URL(request.url).origin;
    } catch {
      /* fall through */
    }
  }
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  return "http://localhost:3000";
}

export function checkoutIntegrationId(): string | undefined {
  return process.env.STRIPE_CHECKOUT_INTEGRATION_ID || undefined;
}

export function onrampNetworkForClientNetwork(
  clientNetwork: string,
): OnrampNetwork {
  if (clientNetwork === "bitcoin") return "bitcoin";
  return "ethereum";
}

export function onrampCurrencyForNetwork(network: OnrampNetwork): OnrampCurrency {
  if (network === "bitcoin") return "btc";
  return "usdc";
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
