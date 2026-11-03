import { NextResponse } from "next/server";
import { markPurchasePaid } from "@/lib/users";
import {
  isValidOpsKey,
  markCryptoInvoicePaid,
} from "@/lib/wallets";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      invoiceId?: string;
      key?: string;
    };
    if (!isValidOpsKey(body.key)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const invoiceId = String(body.invoiceId || "");
    if (!invoiceId) {
      return NextResponse.json({ error: "invoiceId required" }, { status: 400 });
    }
    const invoice = await markCryptoInvoicePaid(invoiceId);
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    await markPurchasePaid({
      cryptoInvoiceId: invoice.id,
      userId: invoice.userId,
    });
    return NextResponse.json({ ok: true, invoiceId: invoice.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Confirm failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
