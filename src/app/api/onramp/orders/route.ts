import { NextRequest, NextResponse } from "next/server";
import { createOnrampOrder } from "@/app/actions/createOnrampOrder";
import type { OnrampChain } from "@/lib/crossmint";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    email?: string;
    amount?: string;
    chain?: OnrampChain;
    walletAddress?: string;
  };

  const result = await createOnrampOrder({
    email: body.email || "",
    amount: body.amount || "20",
    chain: body.chain || "polygon",
    walletAddress: body.walletAddress,
  });

  return NextResponse.json(result, {
    status: result.ok ? 200 : result.status || 400,
  });
}
