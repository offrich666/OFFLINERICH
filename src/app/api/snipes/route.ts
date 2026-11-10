import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  cancelSnipe,
  createSnipe,
  listSnipes,
  updateSnipe,
} from "@/lib/snipes";
import { listUserWallets } from "@/lib/userWallets";
import { loadSearchScreenerTokens } from "@/lib/dexscreener";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const snipes = await listSnipes(user.id);
  return NextResponse.json({ snipes });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    walletId?: string;
    tokenQuery?: string;
    tokenAddress?: string;
    minLiquidityUsd?: number;
    maxSpendNative?: string;
    note?: string;
    action?: "create" | "cancel" | "check" | "trigger";
    id?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action ?? "create";

  if (action === "cancel") {
    if (!body.id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const job = await cancelSnipe(user.id, body.id);
    if (!job) {
      return NextResponse.json({ error: "Snipe not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, snipe: job });
  }

  if (action === "trigger") {
    if (!body.id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const job = await updateSnipe(user.id, body.id, { status: "triggered" });
    if (!job) {
      return NextResponse.json({ error: "Snipe not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, snipe: job });
  }

  if (action === "check") {
    if (!body.id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const snipes = await listSnipes(user.id);
    const current = snipes.find((s) => s.id === body.id);
    if (!current) {
      return NextResponse.json({ error: "Snipe not found" }, { status: 404 });
    }
    if (current.status === "cancelled" || current.status === "triggered") {
      return NextResponse.json({ ok: true, snipe: current });
    }

    const query = current.tokenAddress || current.tokenQuery;
    const tokens = await loadSearchScreenerTokens(query);
    const match =
      tokens.find((t) =>
        current.tokenAddress
          ? t.tokenAddress.toLowerCase() === current.tokenAddress.toLowerCase()
          : true,
      ) ?? tokens[0];

    if (!match) {
      return NextResponse.json({
        ok: true,
        snipe: current,
        message: "Token not listed yet",
      });
    }

    const liq = match.liquidityUsd ?? 0;
    const ready = liq >= current.minLiquidityUsd;
    const job = await updateSnipe(user.id, current.id, {
      status: ready ? "ready" : "watching",
      pairUrl: match.url,
      lastLiquidityUsd: liq,
      tokenAddress: match.tokenAddress,
    });
    return NextResponse.json({ ok: true, snipe: job, token: match });
  }

  const walletId = body.walletId?.trim() ?? "";
  const tokenQuery = body.tokenQuery?.trim() ?? "";
  const maxSpendNative = body.maxSpendNative?.trim() ?? "";
  const minLiquidityUsd = Number(body.minLiquidityUsd ?? 0);

  if (!walletId || !tokenQuery || !maxSpendNative) {
    return NextResponse.json(
      { error: "walletId, tokenQuery, and maxSpendNative required" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(minLiquidityUsd) || minLiquidityUsd < 0) {
    return NextResponse.json({ error: "Invalid minLiquidityUsd" }, { status: 400 });
  }

  const wallets = await listUserWallets(user.id);
  const wallet = wallets.find((w) => w.id === walletId);
  if (!wallet) {
    return NextResponse.json({ error: "Wallet not found on your account" }, { status: 404 });
  }

  const job = await createSnipe({
    userId: user.id,
    walletId: wallet.id,
    walletAddress: wallet.address,
    chain: wallet.chain,
    tokenQuery,
    tokenAddress: body.tokenAddress ?? null,
    minLiquidityUsd,
    maxSpendNative,
    note: body.note ?? null,
  });

  return NextResponse.json({ ok: true, snipe: job });
}
