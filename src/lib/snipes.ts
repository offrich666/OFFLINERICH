import "server-only";
import { promises as fs } from "fs";
import path from "path";

export type SnipeStatus = "watching" | "ready" | "triggered" | "cancelled";

export type SnipeJob = {
  id: string;
  userId: string;
  walletId: string;
  walletAddress: string;
  chain: "evm" | "solana";
  tokenQuery: string;
  tokenAddress?: string | null;
  minLiquidityUsd: number;
  maxSpendNative: string;
  note?: string | null;
  status: SnipeStatus;
  pairUrl?: string | null;
  lastLiquidityUsd?: number | null;
  createdAt: string;
  updatedAt: string;
};

const DATA_DIR =
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? path.join("/tmp", "offlinerich-data")
    : path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "snipes.json");

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(FILE);
  } catch {
    await fs.writeFile(FILE, "[]\n", "utf8");
  }
}

async function readAll(): Promise<SnipeJob[]> {
  await ensureStore();
  const raw = await fs.readFile(FILE, "utf8");
  try {
    return JSON.parse(raw) as SnipeJob[];
  } catch {
    return [];
  }
}

async function writeAll(rows: SnipeJob[]) {
  await ensureStore();
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2) + "\n", "utf8");
}

export async function listSnipes(userId: string): Promise<SnipeJob[]> {
  const rows = await readAll();
  return rows
    .filter((r) => r.userId === userId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createSnipe(input: {
  userId: string;
  walletId: string;
  walletAddress: string;
  chain: "evm" | "solana";
  tokenQuery: string;
  tokenAddress?: string | null;
  minLiquidityUsd: number;
  maxSpendNative: string;
  note?: string | null;
}): Promise<SnipeJob> {
  const rows = await readAll();
  const now = new Date().toISOString();
  const job: SnipeJob = {
    id: `snp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    userId: input.userId,
    walletId: input.walletId,
    walletAddress: input.walletAddress,
    chain: input.chain,
    tokenQuery: input.tokenQuery.trim(),
    tokenAddress: input.tokenAddress?.trim() || null,
    minLiquidityUsd: input.minLiquidityUsd,
    maxSpendNative: input.maxSpendNative.trim(),
    note: input.note?.trim() || null,
    status: "watching",
    pairUrl: null,
    lastLiquidityUsd: null,
    createdAt: now,
    updatedAt: now,
  };
  rows.unshift(job);
  await writeAll(rows.slice(0, 2000));
  return job;
}

export async function updateSnipe(
  userId: string,
  id: string,
  patch: Partial<
    Pick<
      SnipeJob,
      "status" | "pairUrl" | "lastLiquidityUsd" | "tokenAddress"
    >
  >,
): Promise<SnipeJob | null> {
  const rows = await readAll();
  const job = rows.find((r) => r.id === id && r.userId === userId);
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  await writeAll(rows);
  return job;
}

export async function cancelSnipe(
  userId: string,
  id: string,
): Promise<SnipeJob | null> {
  return updateSnipe(userId, id, { status: "cancelled" });
}
