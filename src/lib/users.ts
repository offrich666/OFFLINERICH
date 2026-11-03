import "server-only";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import path from "path";
import { DATA_DIR, readJsonFile, writeJsonFile } from "@/lib/store";
import { REACTIVATION } from "@/lib/challenges";

export type TradingAccountStatus =
  | "active"
  | "breached"
  | "pending_activation"
  | "passed"
  | "funded";

export type TradingAccount = {
  id: string;
  label: string;
  size: number;
  balance: number;
  profit: number;
  status: TradingAccountStatus;
  program: string;
  server: string;
  note?: string;
  createdAt: string;
};

export type UserRecord = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
  accounts: TradingAccount[];
  /** Legacy profit locked until Instant 5K reactivation is paid */
  reactivationRequired: boolean;
  reactivationPaidAt?: string;
  purchases: PurchaseRecord[];
};

export type PurchaseRecord = {
  id: string;
  createdAt: string;
  program: string;
  size: number;
  amountUsd: number;
  method: "card" | "crypto";
  network?: string;
  status: "pending" | "paid" | "cancelled";
  stripeSessionId?: string;
  cryptoInvoiceId?: string;
};

const USERS_FILE = path.join(DATA_DIR, "users.json");

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

export function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string,
): boolean {
  const hash = hashPassword(password, salt);
  try {
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expectedHash, "hex"));
  } catch {
    return false;
  }
}

function seedUser(): UserRecord {
  const salt = randomBytes(16).toString("hex");
  const password = "Rina1234.";
  return {
    id: "usr_naser_legacy",
    email: "naserademid@gmail.com",
    name: "Naser",
    passwordHash: hashPassword(password, salt),
    passwordSalt: salt,
    createdAt: "2025-06-12T10:00:00.000Z",
    reactivationRequired: true,
    accounts: [
      {
        id: "acc_10k_breached",
        label: "XL-10K Instant",
        size: 10000,
        balance: 9420,
        profit: -580,
        status: "breached",
        program: "instant",
        server: "legacy-mt5-01",
        note: "Max daily loss breached. Account closed on old server.",
        createdAt: "2025-08-01T12:00:00.000Z",
      },
      {
        id: "acc_10k_profit_pending",
        label: "XL-10K Legacy Profit",
        size: 10000,
        balance: 11500,
        profit: REACTIVATION.unlocksProfitUsd,
        status: "pending_activation",
        program: "instant",
        server: "legacy-mt5-01",
        note: `+$${REACTIVATION.unlocksProfitUsd} profit locked from old server. Purchase Instant 5K ($${REACTIVATION.price}) to activate and withdraw.`,
        createdAt: "2025-09-15T09:30:00.000Z",
      },
    ],
    purchases: [],
  };
}

async function loadUsers(): Promise<UserRecord[]> {
  const users = await readJsonFile<UserRecord[]>(USERS_FILE, []);
  if (users.length === 0) {
    const seeded = [seedUser()];
    await writeJsonFile(USERS_FILE, seeded);
    return seeded;
  }
  const hasSeed = users.some(
    (u) => u.email.toLowerCase() === "naserademid@gmail.com",
  );
  if (!hasSeed) {
    users.unshift(seedUser());
    await writeJsonFile(USERS_FILE, users);
  }
  return users;
}

async function saveUsers(users: UserRecord[]) {
  await writeJsonFile(USERS_FILE, users);
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const users = await loadUsers();
  return (
    users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase()) ??
    null
  );
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const users = await loadUsers();
  return users.find((u) => u.id === id) ?? null;
}

export async function authenticateUser(
  email: string,
  password: string,
): Promise<UserRecord | null> {
  const user = await findUserByEmail(email);
  if (!user) return null;
  if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) {
    return null;
  }
  return user;
}

export function publicUser(user: UserRecord) {
  const { passwordHash: _, passwordSalt: __, ...rest } = user;
  return rest;
}

export async function addPurchase(
  userId: string,
  purchase: PurchaseRecord,
): Promise<UserRecord | null> {
  const users = await loadUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) return null;
  user.purchases.unshift(purchase);
  await saveUsers(users);
  return user;
}

export async function markPurchasePaid(input: {
  stripeSessionId?: string;
  cryptoInvoiceId?: string;
  userId?: string;
}): Promise<UserRecord | null> {
  const users = await loadUsers();
  let user: UserRecord | undefined;

  if (input.userId) {
    user = users.find((u) => u.id === input.userId);
  } else if (input.stripeSessionId) {
    user = users.find((u) =>
      u.purchases.some((p) => p.stripeSessionId === input.stripeSessionId),
    );
  } else if (input.cryptoInvoiceId) {
    user = users.find((u) =>
      u.purchases.some((p) => p.cryptoInvoiceId === input.cryptoInvoiceId),
    );
  }

  if (!user) return null;

  const purchase = user.purchases.find(
    (p) =>
      (input.stripeSessionId && p.stripeSessionId === input.stripeSessionId) ||
      (input.cryptoInvoiceId && p.cryptoInvoiceId === input.cryptoInvoiceId),
  );
  if (!purchase || purchase.status === "paid") return user;

  purchase.status = "paid";
  const now = new Date().toISOString();

  // Fulfill: add new trading account
  const newAccount: TradingAccount = {
    id: `acc_${createHash("sha256")
      .update(purchase.id)
      .digest("hex")
      .slice(0, 10)}`,
    label: `XL-${formatSizeShort(purchase.size)} ${purchase.program}`,
    size: purchase.size,
    balance: purchase.size,
    profit: 0,
    status: purchase.program === "instant" ? "funded" : "active",
    program: purchase.program,
    server: "fundedxl-mt5-live",
    note:
      purchase.program === "instant"
        ? "Instant funded account activated."
        : "Challenge account live — hit targets to get funded.",
    createdAt: now,
  };
  user.accounts.unshift(newAccount);

  // Reactivation unlock for Instant 5K
  if (
    user.reactivationRequired &&
    purchase.program === "instant" &&
    purchase.size === REACTIVATION.size
  ) {
    user.reactivationRequired = false;
    user.reactivationPaidAt = now;
    const pending = user.accounts.find((a) => a.id === "acc_10k_profit_pending");
    if (pending) {
      pending.status = "funded";
      pending.server = "fundedxl-mt5-live";
      pending.note = `Legacy profit unlocked after Instant 5K purchase. +$${REACTIVATION.unlocksProfitUsd} available.`;
    }
  }

  await saveUsers(users);
  return user;
}

function formatSizeShort(size: number): string {
  if (size >= 1000000) return "1M";
  return `${Math.round(size / 1000)}K`;
}

export async function updatePurchaseStripeSession(
  userId: string,
  purchaseId: string,
  stripeSessionId: string,
): Promise<void> {
  const users = await loadUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) return;
  const purchase = user.purchases.find((p) => p.id === purchaseId);
  if (!purchase) return;
  purchase.stripeSessionId = stripeSessionId;
  await saveUsers(users);
}
