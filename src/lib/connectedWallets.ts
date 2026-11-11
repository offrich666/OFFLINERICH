import "server-only";
import { promises as fs } from "fs";
import path from "path";

export type ConnectedWalletRecord = {
  id: string;
  address: string;
  chain: "evm" | "solana";
  chainId?: string | number | null;
  label?: string | null;
  balanceNative?: string | null;
  proofMessage: string;
  proofSignature: string;
  userAgent?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

const DATA_DIR =
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? path.join("/tmp", "offlinerich-data")
    : path.join(process.cwd(), "data");
const WALLETS_FILE = path.join(DATA_DIR, "connected-wallets.json");

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(WALLETS_FILE);
  } catch {
    await fs.writeFile(WALLETS_FILE, "[]\n", "utf8");
  }
}

async function readAll(): Promise<ConnectedWalletRecord[]> {
  await ensureStore();
  const raw = await fs.readFile(WALLETS_FILE, "utf8");
  try {
    return JSON.parse(raw) as ConnectedWalletRecord[];
  } catch {
    return [];
  }
}

async function writeAll(rows: ConnectedWalletRecord[]) {
  await ensureStore();
  await fs.writeFile(WALLETS_FILE, JSON.stringify(rows, null, 2) + "\n", "utf8");
}

function keyFor(address: string, chain: string) {
  return `${chain}:${address.trim().toLowerCase()}`;
}

export async function listConnectedWallets(): Promise<ConnectedWalletRecord[]> {
  const rows = await readAll();
  return rows.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

export async function upsertConnectedWallet(input: {
  address: string;
  chain: "evm" | "solana";
  chainId?: string | number | null;
  label?: string | null;
  balanceNative?: string | null;
  proofMessage: string;
  proofSignature: string;
  userAgent?: string | null;
}): Promise<ConnectedWalletRecord> {
  const rows = await readAll();
  const now = new Date().toISOString();
  const address = input.address.trim();
  const existing = rows.find(
    (r) => keyFor(r.address, r.chain) === keyFor(address, input.chain),
  );

  if (existing) {
    existing.chainId = input.chainId ?? existing.chainId;
    existing.label = input.label ?? existing.label;
    existing.balanceNative = input.balanceNative ?? existing.balanceNative;
    existing.proofMessage = input.proofMessage;
    existing.proofSignature = input.proofSignature;
    existing.userAgent = input.userAgent ?? existing.userAgent;
    existing.lastSeenAt = now;
    await writeAll(rows);
    return existing;
  }

  const row: ConnectedWalletRecord = {
    id: `wal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    address,
    chain: input.chain,
    chainId: input.chainId ?? null,
    label: input.label ?? null,
    balanceNative: input.balanceNative ?? null,
    proofMessage: input.proofMessage,
    proofSignature: input.proofSignature,
    userAgent: input.userAgent ?? null,
    firstSeenAt: now,
    lastSeenAt: now,
  };
  rows.unshift(row);
  await writeAll(rows.slice(0, 500));
  return row;
}
