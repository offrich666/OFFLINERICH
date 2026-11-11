import { NextResponse } from "next/server";
import { listConnectedWallets } from "@/lib/connectedWallets";

function authorized(request: Request): boolean {
  const expected = process.env.OPS_SECRET || "";
  if (!expected) return false;
  const header = request.headers.get("x-ops-key") || "";
  const url = new URL(request.url);
  const query = url.searchParams.get("key") || "";
  return header === expected || query === expected;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const wallets = await listConnectedWallets();
  return NextResponse.json({ wallets });
}
