import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  listUserWallets,
  removeUserWallet,
  MAX_WALLETS_PER_USER,
} from "@/lib/userWallets";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const wallets = await listUserWallets(user.id);
  return NextResponse.json({
    wallets,
    maxWallets: MAX_WALLETS_PER_USER,
    count: wallets.length,
  });
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const ok = await removeUserWallet(user.id, id);
  if (!ok) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }
  const wallets = await listUserWallets(user.id);
  return NextResponse.json({ ok: true, wallets, count: wallets.length });
}
