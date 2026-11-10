import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin";
import {
  creditDeposit,
  listAllBalances,
  listDeposits,
  listWithdrawals,
  markWithdrawSent,
  rejectDeposit,
  rejectWithdraw,
} from "@/lib/ledger";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [balances, deposits, withdrawals] = await Promise.all([
    listAllBalances(),
    listDeposits(),
    listWithdrawals(),
  ]);
  return NextResponse.json({ balances, deposits, withdrawals });
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    action?: string;
    depositId?: string;
    withdrawId?: string;
    txHash?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action ?? "";

  if (action === "credit_deposit") {
    const result = await creditDeposit({ depositId: body.depositId ?? "" });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, deposit: result.deposit });
  }

  if (action === "reject_deposit") {
    const result = await rejectDeposit({ depositId: body.depositId ?? "" });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, deposit: result.deposit });
  }

  if (action === "send_withdraw") {
    const result = await markWithdrawSent({
      withdrawId: body.withdrawId ?? "",
      txHash: body.txHash ?? "",
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, withdraw: result.withdraw });
  }

  if (action === "reject_withdraw") {
    const result = await rejectWithdraw({ withdrawId: body.withdrawId ?? "" });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, withdraw: result.withdraw });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
