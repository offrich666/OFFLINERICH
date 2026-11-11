import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin";
import { listUsers, resetUserPassword } from "@/lib/auth";
import { countWalletsByUser, listAllUserWallets } from "@/lib/userWallets";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const users = await listUsers();
  const counts = await countWalletsByUser();
  const wallets = await listAllUserWallets();
  return NextResponse.json({
    users: users.map((u) => ({
      ...u,
      walletCount: counts[u.id] ?? 0,
    })),
    wallets,
  });
}

export async function POST(request: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { userId?: string; newPassword?: string };
  try {
    body = (await request.json()) as {
      userId?: string;
      newPassword?: string;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.userId || !body.newPassword) {
    return NextResponse.json(
      { error: "userId and newPassword required" },
      { status: 400 },
    );
  }
  const result = await resetUserPassword({
    userId: body.userId,
    newPassword: body.newPassword,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
