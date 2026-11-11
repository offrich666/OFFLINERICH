import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { TREASURY } from "@/lib/treasury";

export type LedgerAsset = "ETH" | "USDC" | "SOL" | "BTC";
export type LedgerChain = "evm" | "solana" | "bitcoin";

export type BalanceRow = {
  userId: string;
  asset: LedgerAsset;
  chain: LedgerChain;
  available: number;
  pendingDeposit: number;
  pendingWithdraw: number;
  updatedAt: string;
};

export type DepositRecord = {
  id: string;
  userId: string;
  asset: LedgerAsset;
  chain: LedgerChain;
  amount: number;
  depositAddress: string;
  txHash?: string | null;
  status: "awaiting_tx" | "submitted" | "credited" | "rejected";
  note?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WithdrawRecord = {
  id: string;
  userId: string;
  asset: LedgerAsset;
  chain: LedgerChain;
  amount: number;
  toAddress: string;
  walletId?: string | null;
  txHash?: string | null;
  status: "requested" | "processing" | "sent" | "rejected" | "cancelled";
  note?: string | null;
  createdAt: string;
  updatedAt: string;
};

const DATA_DIR =
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? path.join("/tmp", "offlinerich-data")
    : path.join(process.cwd(), "data");

const BALANCES_FILE = path.join(DATA_DIR, "balances.json");
const DEPOSITS_FILE = path.join(DATA_DIR, "deposits.json");
const WITHDRAWS_FILE = path.join(DATA_DIR, "withdrawals.json");

async function ensureFile(file: string) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, "[]\n", "utf8");
  }
}

async function readJson<T>(file: string): Promise<T[]> {
  await ensureFile(file);
  const raw = await fs.readFile(file, "utf8");
  try {
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

async function writeJson<T>(file: string, rows: T[]) {
  await ensureFile(file);
  await fs.writeFile(file, JSON.stringify(rows, null, 2) + "\n", "utf8");
}

export function depositAddressFor(chain: LedgerChain): string {
  if (chain === "bitcoin") return TREASURY.bitcoin;
  if (chain === "solana") {
    return process.env.TREASURY_SOLANA || TREASURY.evm;
  }
  return TREASURY.evm;
}

export function isLedgerAsset(value: string): value is LedgerAsset {
  return value === "ETH" || value === "USDC" || value === "SOL" || value === "BTC";
}

export function isLedgerChain(value: string): value is LedgerChain {
  return value === "evm" || value === "solana" || value === "bitcoin";
}

function balanceKey(userId: string, asset: LedgerAsset, chain: LedgerChain) {
  return `${userId}:${asset}:${chain}`;
}

async function getOrCreateBalance(
  rows: BalanceRow[],
  userId: string,
  asset: LedgerAsset,
  chain: LedgerChain,
): Promise<BalanceRow> {
  const existing = rows.find(
    (r) => balanceKey(r.userId, r.asset, r.chain) === balanceKey(userId, asset, chain),
  );
  if (existing) return existing;
  const row: BalanceRow = {
    userId,
    asset,
    chain,
    available: 0,
    pendingDeposit: 0,
    pendingWithdraw: 0,
    updatedAt: new Date().toISOString(),
  };
  rows.push(row);
  return row;
}

export async function listBalances(userId: string): Promise<BalanceRow[]> {
  const rows = await readJson<BalanceRow>(BALANCES_FILE);
  return rows
    .filter((r) => r.userId === userId)
    .sort((a, b) => a.asset.localeCompare(b.asset));
}

export async function listAllBalances(): Promise<BalanceRow[]> {
  return readJson<BalanceRow>(BALANCES_FILE);
}

export async function listDeposits(userId?: string): Promise<DepositRecord[]> {
  const rows = await readJson<DepositRecord>(DEPOSITS_FILE);
  const filtered = userId ? rows.filter((r) => r.userId === userId) : rows;
  return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listWithdrawals(userId?: string): Promise<WithdrawRecord[]> {
  const rows = await readJson<WithdrawRecord>(WITHDRAWS_FILE);
  const filtered = userId ? rows.filter((r) => r.userId === userId) : rows;
  return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createDeposit(input: {
  userId: string;
  asset: LedgerAsset;
  chain: LedgerChain;
  amount: number;
  note?: string | null;
}): Promise<{ deposit: DepositRecord } | { error: string; status: number }> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { error: "Amount must be greater than 0", status: 400 };
  }
  if (input.asset === "BTC" && input.chain !== "bitcoin") {
    return { error: "BTC deposits must use bitcoin chain", status: 400 };
  }
  if (input.asset === "SOL" && input.chain !== "solana") {
    return { error: "SOL deposits must use solana chain", status: 400 };
  }
  if ((input.asset === "ETH" || input.asset === "USDC") && input.chain !== "evm") {
    return { error: `${input.asset} deposits must use evm chain`, status: 400 };
  }

  const deposits = await readJson<DepositRecord>(DEPOSITS_FILE);
  const balances = await readJson<BalanceRow>(BALANCES_FILE);
  const now = new Date().toISOString();
  const deposit: DepositRecord = {
    id: `dep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    userId: input.userId,
    asset: input.asset,
    chain: input.chain,
    amount: input.amount,
    depositAddress: depositAddressFor(input.chain),
    txHash: null,
    status: "awaiting_tx",
    note: input.note?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
  deposits.unshift(deposit);

  const bal = await getOrCreateBalance(
    balances,
    input.userId,
    input.asset,
    input.chain,
  );
  bal.pendingDeposit += input.amount;
  bal.updatedAt = now;

  await writeJson(DEPOSITS_FILE, deposits.slice(0, 5000));
  await writeJson(BALANCES_FILE, balances);
  return { deposit };
}

export async function submitDepositTx(input: {
  userId: string;
  depositId: string;
  txHash: string;
}): Promise<{ deposit: DepositRecord } | { error: string; status: number }> {
  const txHash = input.txHash.trim();
  if (txHash.length < 8) {
    return { error: "txHash required", status: 400 };
  }
  const deposits = await readJson<DepositRecord>(DEPOSITS_FILE);
  const deposit = deposits.find(
    (d) => d.id === input.depositId && d.userId === input.userId,
  );
  if (!deposit) return { error: "Deposit not found", status: 404 };
  if (deposit.status !== "awaiting_tx" && deposit.status !== "submitted") {
    return { error: "Deposit can no longer accept a tx hash", status: 400 };
  }
  deposit.txHash = txHash;
  deposit.status = "submitted";
  deposit.updatedAt = new Date().toISOString();
  await writeJson(DEPOSITS_FILE, deposits);
  return { deposit };
}

export async function creditDeposit(input: {
  depositId: string;
}): Promise<{ deposit: DepositRecord } | { error: string; status: number }> {
  const deposits = await readJson<DepositRecord>(DEPOSITS_FILE);
  const balances = await readJson<BalanceRow>(BALANCES_FILE);
  const deposit = deposits.find((d) => d.id === input.depositId);
  if (!deposit) return { error: "Deposit not found", status: 404 };
  if (deposit.status === "credited") return { deposit };
  if (deposit.status === "rejected") {
    return { error: "Deposit was rejected", status: 400 };
  }
  if (!deposit.txHash) {
    return { error: "Deposit needs a tx hash before credit", status: 400 };
  }

  const now = new Date().toISOString();
  const bal = await getOrCreateBalance(
    balances,
    deposit.userId,
    deposit.asset,
    deposit.chain,
  );
  if (deposit.status === "awaiting_tx" || deposit.status === "submitted") {
    bal.pendingDeposit = Math.max(0, bal.pendingDeposit - deposit.amount);
  }
  bal.available += deposit.amount;
  bal.updatedAt = now;
  deposit.status = "credited";
  deposit.updatedAt = now;

  await writeJson(DEPOSITS_FILE, deposits);
  await writeJson(BALANCES_FILE, balances);
  return { deposit };
}

export async function rejectDeposit(input: {
  depositId: string;
}): Promise<{ deposit: DepositRecord } | { error: string; status: number }> {
  const deposits = await readJson<DepositRecord>(DEPOSITS_FILE);
  const balances = await readJson<BalanceRow>(BALANCES_FILE);
  const deposit = deposits.find((d) => d.id === input.depositId);
  if (!deposit) return { error: "Deposit not found", status: 404 };
  if (deposit.status === "credited") {
    return { error: "Already credited", status: 400 };
  }
  if (deposit.status === "rejected") return { deposit };

  const now = new Date().toISOString();
  const bal = await getOrCreateBalance(
    balances,
    deposit.userId,
    deposit.asset,
    deposit.chain,
  );
  bal.pendingDeposit = Math.max(0, bal.pendingDeposit - deposit.amount);
  bal.updatedAt = now;
  deposit.status = "rejected";
  deposit.updatedAt = now;

  await writeJson(DEPOSITS_FILE, deposits);
  await writeJson(BALANCES_FILE, balances);
  return { deposit };
}

export async function requestWithdraw(input: {
  userId: string;
  asset: LedgerAsset;
  chain: LedgerChain;
  amount: number;
  toAddress: string;
  walletId?: string | null;
  note?: string | null;
}): Promise<{ withdraw: WithdrawRecord } | { error: string; status: number }> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { error: "Amount must be greater than 0", status: 400 };
  }
  const toAddress = input.toAddress.trim();
  if (!toAddress) return { error: "Destination address required", status: 400 };

  const withdrawals = await readJson<WithdrawRecord>(WITHDRAWS_FILE);
  const balances = await readJson<BalanceRow>(BALANCES_FILE);
  const bal = await getOrCreateBalance(
    balances,
    input.userId,
    input.asset,
    input.chain,
  );
  if (bal.available < input.amount) {
    return { error: "Insufficient available balance", status: 400 };
  }

  const now = new Date().toISOString();
  bal.available -= input.amount;
  bal.pendingWithdraw += input.amount;
  bal.updatedAt = now;

  const withdraw: WithdrawRecord = {
    id: `wd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    userId: input.userId,
    asset: input.asset,
    chain: input.chain,
    amount: input.amount,
    toAddress,
    walletId: input.walletId ?? null,
    txHash: null,
    status: "requested",
    note: input.note?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
  withdrawals.unshift(withdraw);

  await writeJson(WITHDRAWS_FILE, withdrawals.slice(0, 5000));
  await writeJson(BALANCES_FILE, balances);
  return { withdraw };
}

export async function markWithdrawSent(input: {
  withdrawId: string;
  txHash: string;
}): Promise<{ withdraw: WithdrawRecord } | { error: string; status: number }> {
  const txHash = input.txHash.trim();
  if (txHash.length < 8) return { error: "txHash required", status: 400 };

  const withdrawals = await readJson<WithdrawRecord>(WITHDRAWS_FILE);
  const balances = await readJson<BalanceRow>(BALANCES_FILE);
  const withdraw = withdrawals.find((w) => w.id === input.withdrawId);
  if (!withdraw) return { error: "Withdrawal not found", status: 404 };
  if (withdraw.status === "sent") return { withdraw };
  if (withdraw.status === "rejected" || withdraw.status === "cancelled") {
    return { error: "Withdrawal is closed", status: 400 };
  }

  const now = new Date().toISOString();
  const bal = await getOrCreateBalance(
    balances,
    withdraw.userId,
    withdraw.asset,
    withdraw.chain,
  );
  bal.pendingWithdraw = Math.max(0, bal.pendingWithdraw - withdraw.amount);
  bal.updatedAt = now;
  withdraw.txHash = txHash;
  withdraw.status = "sent";
  withdraw.updatedAt = now;

  await writeJson(WITHDRAWS_FILE, withdrawals);
  await writeJson(BALANCES_FILE, balances);
  return { withdraw };
}

export async function rejectWithdraw(input: {
  withdrawId: string;
}): Promise<{ withdraw: WithdrawRecord } | { error: string; status: number }> {
  const withdrawals = await readJson<WithdrawRecord>(WITHDRAWS_FILE);
  const balances = await readJson<BalanceRow>(BALANCES_FILE);
  const withdraw = withdrawals.find((w) => w.id === input.withdrawId);
  if (!withdraw) return { error: "Withdrawal not found", status: 404 };
  if (withdraw.status === "sent") {
    return { error: "Already sent", status: 400 };
  }
  if (withdraw.status === "rejected" || withdraw.status === "cancelled") {
    return { withdraw };
  }

  const now = new Date().toISOString();
  const bal = await getOrCreateBalance(
    balances,
    withdraw.userId,
    withdraw.asset,
    withdraw.chain,
  );
  bal.pendingWithdraw = Math.max(0, bal.pendingWithdraw - withdraw.amount);
  bal.available += withdraw.amount;
  bal.updatedAt = now;
  withdraw.status = "rejected";
  withdraw.updatedAt = now;

  await writeJson(WITHDRAWS_FILE, withdrawals);
  await writeJson(BALANCES_FILE, balances);
  return { withdraw };
}

export async function cancelWithdraw(input: {
  userId: string;
  withdrawId: string;
}): Promise<{ withdraw: WithdrawRecord } | { error: string; status: number }> {
  const withdrawals = await readJson<WithdrawRecord>(WITHDRAWS_FILE);
  const balances = await readJson<BalanceRow>(BALANCES_FILE);
  const withdraw = withdrawals.find(
    (w) => w.id === input.withdrawId && w.userId === input.userId,
  );
  if (!withdraw) return { error: "Withdrawal not found", status: 404 };
  if (withdraw.status !== "requested") {
    return { error: "Only requested withdrawals can be cancelled", status: 400 };
  }

  const now = new Date().toISOString();
  const bal = await getOrCreateBalance(
    balances,
    withdraw.userId,
    withdraw.asset,
    withdraw.chain,
  );
  bal.pendingWithdraw = Math.max(0, bal.pendingWithdraw - withdraw.amount);
  bal.available += withdraw.amount;
  bal.updatedAt = now;
  withdraw.status = "cancelled";
  withdraw.updatedAt = now;

  await writeJson(WITHDRAWS_FILE, withdrawals);
  await writeJson(BALANCES_FILE, balances);
  return { withdraw };
}
