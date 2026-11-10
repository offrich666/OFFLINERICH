import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  cancelWithdraw,
  createDeposit,
  isLedgerAsset,
  isLedgerChain,
  listBalances,
  listDeposits,
  listWithdrawals,
  requestWithdraw,
  submitDepositTx,
} from "@/lib/ledger";
import { listUserWallets } from "@/lib/userWallets";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [balances, deposits, withdrawals, wallets] = await Promise.all([
    listBalances(user.id),
    listDeposits(user.id),
    listWithdrawals(user.id),
    listUserWallets(user.id),
  ]);
  return NextResponse.json({ balances, deposits, withdrawals, wallets });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    action?: string;
    asset?: string;
    chain?: string;
    amount?: number | string;
    note?: string;
    depositId?: string;
    withdrawId?: string;
    txHash?: string;
    walletId?: string;
    toAddress?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action ?? "";

  if (action === "deposit") {
    const asset = body.asset ?? "";
    const chain = body.chain ?? "";
    const amount = Number(body.amount);
    if (!isLedgerAsset(asset) || !isLedgerChain(chain)) {
      return NextResponse.json({ error: "Invalid asset/chain" }, { status: 400 });
    }
    const result = await createDeposit({
      userId: user.id,
      asset,
      chain,
      amount,
      note: body.note ?? null,
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, deposit: result.deposit });
  }

  if (action === "deposit_tx") {
    const result = await submitDepositTx({
      userId: user.id,
      depositId: body.depositId ?? "",
      txHash: body.txHash ?? "",
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, deposit: result.deposit });
  }

  if (action === "withdraw") {
    const asset = body.asset ?? "";
    const chain = body.chain ?? "";
    const amount = Number(body.amount);
    if (!isLedgerAsset(asset) || !isLedgerChain(chain)) {
      return NextResponse.json({ error: "Invalid asset/chain" }, { status: 400 });
    }

    let toAddress = body.toAddress?.trim() ?? "";
    let walletId = body.walletId ?? null;
    if (walletId) {
      const wallets = await listUserWallets(user.id);
      const wallet = wallets.find((w) => w.id === walletId);
      if (!wallet) {
        return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
      }
      toAddress = wallet.address;
      if (wallet.chain === "solana" && chain !== "solana") {
        return NextResponse.json(
          { error: "Solana wallet requires solana chain" },
          { status: 400 },
        );
      }
      if (wallet.chain === "evm" && chain !== "evm") {
        return NextResponse.json(
          { error: "EVM wallet requires evm chain" },
          { status: 400 },
        );
      }
    }
    if (!toAddress) {
      return NextResponse.json({ error: "Destination required" }, { status: 400 });
    }

    const result = await requestWithdraw({
      userId: user.id,
      asset,
      chain,
      amount,
      toAddress,
      walletId,
      note: body.note ?? null,
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, withdraw: result.withdraw });
  }

  if (action === "cancel_withdraw") {
    const result = await cancelWithdraw({
      userId: user.id,
      withdrawId: body.withdrawId ?? "",
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, withdraw: result.withdraw });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
