import { NextResponse } from "next/server";
import {
  crossmintFetch,
  getClientApiKey,
  getCollectionId,
  getCrossmintApiBase,
} from "@/lib/crossmint";

type CollectionsResponse = {
  results?: Array<{
    id: string;
    metadata?: { name?: string };
    payments?: unknown;
  }>;
  error?: boolean;
  message?: string;
};

export async function GET() {
  const clientConfigured = Boolean(getClientApiKey());
  const collectionId = getCollectionId();

  try {
    const { ok, status, data } = await crossmintFetch<CollectionsResponse>(
      "/collections/",
      { method: "GET" },
    );

    const collections = data.results ?? [];
    const selected = collections.find((c) => c.id === collectionId);

    return NextResponse.json({
      ok,
      status,
      apiBase: getCrossmintApiBase(),
      clientKeyConfigured: clientConfigured,
      serverKeyConfigured: true,
      collectionId: collectionId || null,
      collectionFound: Boolean(selected),
      collectionHasPayments: Boolean(selected?.payments),
      collections: collections.map((c) => ({
        id: c.id,
        name: c.metadata?.name ?? c.id,
        hasPayments: Boolean(c.payments),
      })),
      message: data.message,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Crossmint health check failed";
    return NextResponse.json(
      {
        ok: false,
        clientKeyConfigured: clientConfigured,
        serverKeyConfigured: false,
        collectionId: collectionId || null,
        error: message,
      },
      { status: 500 },
    );
  }
}
