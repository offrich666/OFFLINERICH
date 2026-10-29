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

type CustomerInfo = {
  email?: string;
  firstName?: string;
  lastName?: string;
};

type CreateOnrampInput = {
  customerIpAddress?: string;
  sourceAmountUsd: string;
  /** Optional — collected after pay for treasury → client delivery */
  clientNetwork?: string;
  clientWallet?: string;
  clientAsset?: string;
  customer?: CustomerInfo;
};

/**
 * Mint Crypto Onramp session: client pays fiat → USDC locked to OUR treasury.
 * Destination wallet is locked to treasury so the client never picks a network
 * or address during pay. Stripe still runs required KYC inside the widget.
 */
export async function createTreasuryOnrampSession(input: CreateOnrampInput) {
  const stripe = getStripe();
  const clientNetwork = input.clientNetwork || "ethereum";
  const destinationNetwork = onrampNetworkForClientNetwork(clientNetwork);
  const destinationCurrency = onrampCurrencyForNetwork(destinationNetwork);
  const wallets = treasuryWalletAddresses();

  const params: Record<string, unknown> = {
    // Prefill so the widget skips destination picking; cards + wallets globally
    // where Stripe Onramp is available (US + EU today).
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
      flow: "onramp_to_treasury_easy_pay",
      client_network: clientNetwork,
      client_wallet: input.clientWallet || "",
      client_asset: input.clientAsset || "USDC",
      onramp_network: destinationNetwork,
      onramp_currency: destinationCurrency,
      treasury_evm: wallets.ethereum,
      treasury_btc: wallets.bitcoin,
      eu_note: "settle_usdc_ethereum_or_btc",
    },
  };

  if (input.customerIpAddress) {
    params.customer_ip_address = input.customerIpAddress;
  }

  // Prefill what we have so Stripe KYC asks for less typing.
  const customerInformation: Record<string, unknown> = {};
  if (input.customer?.email) {
    customerInformation.email = input.customer.email;
  }
  if (input.customer?.firstName) {
    customerInformation.first_name = input.customer.firstName;
  }
  if (input.customer?.lastName) {
    customerInformation.last_name = input.customer.lastName;
  }
  if (Object.keys(customerInformation).length > 0) {
    params.customer_information = customerInformation;
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
