import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { upsertUserWallet, MAX_WALLETS_PER_USER } from "@/lib/userWallets";

export const runtime = "nodejs";

type Body = {
  address?: string;
  chain?: "evm" | "solana";
  chainId?: string | number | null;
  label?: string | null;
  balanceNative?: string | null;
  proofMessage?: string;
  proofSignature?: string;
};

function isValidEvm(address: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function isValidSolana(address: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Create an account and sign in before connecting a wallet." },
      { status: 401 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const address = body.address?.trim() ?? "";
  const chain = body.chain;
  const proofMessage = body.proofMessage?.trim() ?? "";
  const proofSignature = body.proofSignature?.trim() ?? "";

  if (!chain || (chain !== "evm" && chain !== "solana")) {
    return NextResponse.json({ error: "chain must be evm or solana" }, { status: 400 });
  }
  if (!address || !proofMessage || !proofSignature) {
    return NextResponse.json(
      { error: "address, proofMessage, and proofSignature required" },
      { status: 400 },
    );
  }
  if (chain === "evm" && !isValidEvm(address)) {
    return NextResponse.json({ error: "Invalid EVM address" }, { status: 400 });
  }
  if (chain === "solana" && !isValidSolana(address)) {
    return NextResponse.json({ error: "Invalid Solana address" }, { status: 400 });
  }
  if (!proofMessage.includes(address)) {
    return NextResponse.json(
      { error: "proofMessage must include the wallet address" },
      { status: 400 },
    );
  }

  const result = await upsertUserWallet({
    userId: user.id,
    address,
    chain,
    chainId: body.chainId ?? null,
    label: body.label ?? null,
    balanceNative: body.balanceNative ?? null,
    proofMessage,
    proofSignature,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    wallet: result.wallet,
    maxWallets: MAX_WALLETS_PER_USER,
  });
}
