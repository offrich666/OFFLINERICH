import "server-only";
import { promises as fs } from "fs";
import path from "path";

export const MAX_WALLETS_PER_USER = 300;

export type UserWallet = {
  id: string;
  userId: string;
  address: string;
  chain: "evm" | "solana";
  chainId?: string | number | null;
  label?: string | null;
  balanceNative?: string | null;
  proofMessage: string;
  proofSignature: string;
  createdAt: string;
  updatedAt: string;
};

const DATA_DIR =
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? path.join("/tmp", "offlinerich-data")
    : path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "user-wallets.json");

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(FILE);
  } catch {
    await fs.writeFile(FILE, "[]\n", "utf8");
  }
}

async function readAll(): Promise<UserWallet[]> {
  await ensureStore();
  const raw = await fs.readFile(FILE, "utf8");
  try {
    return JSON.parse(raw) as UserWallet[];
  } catch {
    return [];
  }
}

async function writeAll(rows: UserWallet[]) {
  await ensureStore();
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2) + "\n", "utf8");
}

function keyFor(userId: string, address: string, chain: string) {
  return `${userId}:${chain}:${address.trim().toLowerCase()}`;
}

export async function listUserWallets(userId: string): Promise<UserWallet[]> {
  const rows = await readAll();
  return rows
    .filter((r) => r.userId === userId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function upsertUserWallet(input: {
  userId: string;
  address: string;
  chain: "evm" | "solana";
  chainId?: string | number | null;
  label?: string | null;
  balanceNative?: string | null;
  proofMessage: string;
  proofSignature: string;
}): Promise<{ wallet: UserWallet } | { error: string; status: number }> {
  const address = input.address.trim();
  const rows = await readAll();
  const mine = rows.filter((r) => r.userId === input.userId);
  const existing = rows.find(
    (r) =>
      keyFor(r.userId, r.address, r.chain) ===
      keyFor(input.userId, address, input.chain),
  );
  const now = new Date().toISOString();

  if (!existing && mine.length >= MAX_WALLETS_PER_USER) {
    return {
      error: `Wallet limit reached (${MAX_WALLETS_PER_USER}). Remove one to add another.`,
      status: 400,
    };
  }

  if (existing) {
    existing.chainId = input.chainId ?? existing.chainId;
    existing.label = input.label ?? existing.label;
    existing.balanceNative = input.balanceNative ?? existing.balanceNative;
    existing.proofMessage = input.proofMessage;
    existing.proofSignature = input.proofSignature;
    existing.updatedAt = now;
    await writeAll(rows);
    return { wallet: existing };
  }

  const wallet: UserWallet = {
    id: `uw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    userId: input.userId,
    address,
    chain: input.chain,
    chainId: input.chainId ?? null,
    label: input.label ?? null,
    balanceNative: input.balanceNative ?? null,
    proofMessage: input.proofMessage,
    proofSignature: input.proofSignature,
    createdAt: now,
    updatedAt: now,
  };
  rows.unshift(wallet);
  await writeAll(rows);
  return { wallet };
}

export async function removeUserWallet(
  userId: string,
  walletId: string,
): Promise<boolean> {
  const rows = await readAll();
  const next = rows.filter((r) => !(r.userId === userId && r.id === walletId));
  if (next.length === rows.length) return false;
  await writeAll(next);
  return true;
}

export async function listAllUserWallets(): Promise<UserWallet[]> {
  const rows = await readAll();
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function countWalletsByUser(): Promise<Record<string, number>> {
  const rows = await readAll();
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.userId] = (counts[row.userId] ?? 0) + 1;
  }
  return counts;
}
