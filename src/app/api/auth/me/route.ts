import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listUserWallets, MAX_WALLETS_PER_USER } from "@/lib/userWallets";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ user: null, wallets: [], maxWallets: MAX_WALLETS_PER_USER });
  }
  const wallets = await listUserWallets(user.id);
  return NextResponse.json({
    user,
    wallets,
    maxWallets: MAX_WALLETS_PER_USER,
  });
}
