import { NextResponse } from "next/server";
import { getPublicDepositAddresses } from "@/lib/wallets";

export async function GET() {
  const addresses = await getPublicDepositAddresses();
  return NextResponse.json({ addresses });
}
