import "server-only";
import Stripe from "stripe";
import {
  type OnrampCurrency,
  type OnrampNetwork,
} from "@/lib/treasury";
import { getStripePublishableKey } from "@/lib/stripePublic";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  const key = (process.env.STRIPE_SECRET_KEY || "").trim();
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  // Vercel env pull writes "[SENSITIVE]" placeholders — never call Stripe with those.
  if (
    key === "[SENSITIVE]" ||
    key.length < 20 ||
    !(
      key.startsWith("sk_live_") ||
      key.startsWith("sk_test_") ||
      key.startsWith("rk_live_") ||
      key.startsWith("rk_test_")
    )
  ) {
    throw new Error(
      "STRIPE_SECRET_KEY is invalid or a placeholder. Set the real live secret in Vercel production.",
    );
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
  /** Required — Stripe locks Onramp to THIS wallet (client's own). */
  clientNetwork: string;
  clientWallet: string;
  clientAsset?: string;
  customer?: CustomerInfo;
  /** Return URL after hosted Link Pay (crypto.link.com). */
  finishUrl?: string;
};

/**
 * Mint Crypto Onramp session: client pays fiat → crypto locked to THEIR wallet.
 *
 * Stripe always shows the locked destination in "Confirm your wallet".
 * Locking to the client's own address means they never see the treasury.
 * (Locking to treasury always surfaces the treasury address — unavoidable.)
 *
 * Hosted redirect_url is preferred over the embed Instant Pay path — embed
 * Pay on this live account stalls with "Failed to start payment process"
 * (Link Instant Pay / crypto-js.stripe.com 403) even with settlement_speed=standard.
 */
export async function createClientOnrampSession(input: CreateOnrampInput) {
  const stripe = getStripe();
  const clientNetwork = input.clientNetwork || "ethereum";
  const destinationNetwork = onrampNetworkForClientNetwork(clientNetwork);
  const destinationCurrency = onrampCurrencyForNetwork(destinationNetwork);
  const wallet = input.clientWallet.trim();
  if (!wallet) {
    throw new Error("Client wallet required for Onramp session");
  }

  // Only the client's destination — never treasury — goes into the session.
  const wallets: Record<string, string> =
    destinationNetwork === "bitcoin"
      ? { bitcoin: wallet }
      : { ethereum: wallet };

  // EU merchant (Finland): EUR + standard settlement + card preference.
  // Instant Pay in the embed throws "Failed to start payment process" after Link.
  const params: Record<string, unknown> = {
    source_currency: "eur",
    source_amount: input.sourceAmountUsd,
    destination_currency: destinationCurrency,
    destination_network: destinationNetwork,
    // Lock to a single currency/network so the widget stays simple.
    destination_currencies: [destinationCurrency],
    destination_networks: [destinationNetwork],
    lock_wallet_address: true,
    wallet_addresses: wallets,
    settlement_speed: "standard",
    // Prefer card over broken Instant Pay when Stripe honors the hint.
    preferred_payment_method: "card",
    metadata: {
      project: "offlinerich",
      flow: "onramp_to_client_wallet",
      client_network: clientNetwork,
      client_wallet: wallet,
      client_asset: input.clientAsset || (destinationCurrency === "btc" ? "BTC" : "USDC"),
      onramp_network: destinationNetwork,
      onramp_currency: destinationCurrency,
      settlement_speed: "standard",
      source_currency: "eur",
      preferred_payment_method: "card",
    },
  };

  if (input.finishUrl) {
    params.finish_url = input.finishUrl;
  }

  if (input.customerIpAddress) {
    params.customer_ip_address = input.customerIpAddress;
  }

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

  let session: unknown;
  try {
    session = await stripe.rawRequest(
      "POST",
      "/v1/crypto/onramp_sessions",
      params,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Older Onramp API builds may reject preferred_payment_method — retry without it.
    if (/preferred_payment_method/i.test(message) && "preferred_payment_method" in params) {
      delete params.preferred_payment_method;
      const meta = params.metadata as Record<string, string> | undefined;
      if (meta) delete meta.preferred_payment_method;
      session = await stripe.rawRequest(
        "POST",
        "/v1/crypto/onramp_sessions",
        params,
      );
    } else {
      throw err;
    }
  }

  return session as {
    id: string;
    client_secret: string;
    status: string;
    redirect_url?: string | null;
    livemode?: boolean;
  };
}

/** @deprecated Prefer createClientOnrampSession — treasury lock always shows the address in Stripe UI. */
export async function createTreasuryOnrampSession(input: CreateOnrampInput) {
  return createClientOnrampSession(input);
}
