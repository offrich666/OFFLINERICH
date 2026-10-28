import { NextResponse } from "next/server";
import {
  crossmintFetch,
  getClientApiKey,
  getCollectionId,
  getCrossmintApiBase,
  getDefaultOnrampChain,
  getUsdcEnvironment,
  getUsdcTokenLocator,
  getWalletsApiBase,
} from "@/lib/crossmint";

type CollectionsResponse = {
  results?: Array<{
    id: string;
    metadata?: { name?: string };
    payments?: unknown;
  }>;
  message?: string;
};

type OrderProbeResponse = {
  message?: string;
  clientSecret?: string;
  order?: { orderId?: string; id?: string };
};

export async function GET() {
  const clientConfigured = Boolean(getClientApiKey());
  const collectionId = getCollectionId();
  const environment = getUsdcEnvironment();
  const chain = getDefaultOnrampChain();
  const tokenLocator = getUsdcTokenLocator(chain);

  let collections: CollectionsResponse["results"] = [];
  let collectionsOk = false;
  let collectionsMessage: string | undefined;

  try {
    const { ok, data } = await crossmintFetch<CollectionsResponse>(
      "/collections/",
      { method: "GET" },
    );
    collectionsOk = ok;
    collections = data.results ?? [];
    collectionsMessage = data.message;
  } catch (error) {
    collectionsMessage =
      error instanceof Error ? error.message : "collections probe failed";
  }

  const selected = collections.find((c) => c.id === collectionId);

  // Probe onramp with a throwaway recipient — does not create wallets.
  const probeWallet =
    chain === "solana"
      ? "11111111111111111111111111111112"
      : "0x0000000000000000000000000000000000000001";

  const probe = await crossmintFetch<OrderProbeResponse>("/orders", {
    method: "POST",
    body: JSON.stringify({
      lineItems: [
        {
          tokenLocator,
          executionParameters: {
            mode: "exact-in",
            amount: "5",
          },
        },
      ],
      payment: {
        method: "card",
        receiptEmail: "healthcheck@offlinerich.local",
      },
      recipient: {
        walletAddress: probeWallet,
      },
    }),
  });

  const onrampReady = Boolean(
    probe.ok && (probe.data.order?.orderId || probe.data.order?.id) && probe.data.clientSecret,
  );

  return NextResponse.json({
    ok: collectionsOk || onrampReady,
    environment,
    apiBase: getCrossmintApiBase(),
    walletsApiBase: getWalletsApiBase(),
    clientKeyConfigured: clientConfigured,
    serverKeyConfigured: true,
    onramp: {
      ready: onrampReady,
      chain,
      tokenLocator,
      status: probe.status,
      message: onrampReady
        ? "Onramp order create succeeded"
        : probe.data.message || "Onramp probe failed",
    },
    applePay: {
      verificationPath:
        "/.well-known/apple-developer-merchantid-domain-association",
      note: "Host the Crossmint Apple Pay file and verify your HTTPS domain in Console.",
    },
    collectionId: collectionId || null,
    collectionFound: Boolean(selected),
    collectionHasPayments: Boolean(selected?.payments),
    payoutAddress: process.env.CROSSMINT_PAYOUT_ADDRESS || null,
    collections: collections.map((c) => ({
      id: c.id,
      name: c.metadata?.name ?? c.id,
      hasPayments: Boolean(c.payments),
    })),
    collectionsMessage,
    productionUnlock: {
      required: [
        "Whitelist localhost + HTTPS domain on client API key",
        "Start collection review for offlinerich-drop in Crossmint Console",
        "Complete Crossmint Order Form + KYB via Sales for production card/Apple Pay/onramp",
      ],
      salesUrl: "https://www.crossmint.com/contact/sales",
      consoleUrl: "https://www.crossmint.com/console",
    },
  });
}
