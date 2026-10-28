import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { TREASURY } from "@/lib/treasury";

export type TransferOrderStatus =
  | "awaiting_payment"
  | "paid_pending_treasury"
  | "treasury_funded"
  | "sent_to_client"
  | "failed";

export type TransferOrder = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: TransferOrderStatus;
  amountCents: number;
  currency: string;
  network: string;
  asset: string;
  clientWallet: string;
  /** Internal only — never expose to client UI */
  treasuryWallet: string;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  customerEmail?: string | null;
  notes?: string;
  outboundTxHash?: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const ORDERS_FILE = path.join(DATA_DIR, "transfer-orders.json");

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(ORDERS_FILE);
  } catch {
    await fs.writeFile(ORDERS_FILE, "[]\n", "utf8");
  }
}

export async function listTransferOrders(): Promise<TransferOrder[]> {
  await ensureStore();
  const raw = await fs.readFile(ORDERS_FILE, "utf8");
  try {
    return JSON.parse(raw) as TransferOrder[];
  } catch {
    return [];
  }
}

async function saveOrders(orders: TransferOrder[]) {
  await ensureStore();
  await fs.writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2) + "\n", "utf8");
}

function treasuryForNetwork(network: string): string {
  if (network === "bitcoin") return TREASURY.bitcoin;
  return TREASURY.evm;
}

export async function upsertPaidTransferOrder(input: {
  stripeSessionId: string;
  stripePaymentIntentId?: string | null;
  amountCents: number;
  currency: string;
  network: string;
  asset: string;
  clientWallet: string;
  customerEmail?: string | null;
}): Promise<TransferOrder> {
  const orders = await listTransferOrders();
  const existing = orders.find((o) => o.stripeSessionId === input.stripeSessionId);
  const now = new Date().toISOString();

  if (existing) {
    existing.status = "paid_pending_treasury";
    existing.updatedAt = now;
    existing.amountCents = input.amountCents;
    existing.currency = input.currency;
    existing.network = input.network;
    existing.asset = input.asset;
    existing.clientWallet = input.clientWallet;
    existing.customerEmail = input.customerEmail ?? existing.customerEmail;
    existing.stripePaymentIntentId =
      input.stripePaymentIntentId || existing.stripePaymentIntentId;
    await saveOrders(orders);
    return existing;
  }

  const order: TransferOrder = {
    id: `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    updatedAt: now,
    status: "paid_pending_treasury",
    amountCents: input.amountCents,
    currency: input.currency,
    network: input.network,
    asset: input.asset,
    clientWallet: input.clientWallet,
    treasuryWallet: treasuryForNetwork(input.network),
    stripeSessionId: input.stripeSessionId,
    stripePaymentIntentId: input.stripePaymentIntentId || undefined,
    customerEmail: input.customerEmail,
    notes:
      "Client paid via Stripe. Fund treasury (card→crypto), then send from treasury to clientWallet. Do not expose treasury to client.",
  };

  orders.unshift(order);
  await saveOrders(orders);
  return order;
}

export async function markOrderSent(
  id: string,
  outboundTxHash: string,
): Promise<TransferOrder | null> {
  const orders = await listTransferOrders();
  const order = orders.find((o) => o.id === id);
  if (!order) return null;
  order.status = "sent_to_client";
  order.outboundTxHash = outboundTxHash;
  order.updatedAt = new Date().toISOString();
  await saveOrders(orders);
  return order;
}
