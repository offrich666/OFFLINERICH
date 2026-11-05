import { NextResponse } from "next/server";
import { fetchBuyQuote } from "@/lib/moonpay";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cryptoCode = (searchParams.get("crypto") || "eth").toLowerCase();
    const amount = Number(searchParams.get("amount") || "100");
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }
    const quote = await fetchBuyQuote({
      cryptoCode,
      baseCurrencyAmount: amount,
      baseCurrencyCode: "usd",
    });
    return NextResponse.json({
      ok: true,
      cryptoCode,
      baseCurrencyAmount: amount,
      quoteCurrencyAmount: quote.quoteCurrencyAmount,
      quoteCurrencyCode: quote.quoteCurrencyCode,
      totalAmount: quote.totalAmount,
      feeAmount: quote.feeAmount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "quote failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
