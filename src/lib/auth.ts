import "server-only";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { cookies } from "next/headers";

export type AuthUser = {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

export type PublicUser = {
  id: string;
  email: string;
  createdAt: string;
};

export type SessionRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
};

const DATA_DIR =
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? path.join("/tmp", "offlinerich-data")
    : path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

const SESSION_COOKIE = "or_session";
const SESSION_DAYS = 30;

async function ensureFile(file: string, fallback = "[]\n") {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, fallback, "utf8");
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

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashPassword(password: string, salt?: string) {
  const usedSalt = salt ?? randomBytes(16).toString("hex");
  const hash = scryptSync(password, usedSalt, 64).toString("hex");
  return `${usedSalt}:${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 64);
  const prev = Buffer.from(hash, "hex");
  if (prev.length !== next.length) return false;
  return timingSafeEqual(prev, next);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function toPublic(user: AuthUser): PublicUser {
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}

export async function registerUser(input: {
  email: string;
  password: string;
}): Promise<{ user: PublicUser } | { error: string; status: number }> {
  const email = normalizeEmail(input.email);
  const password = input.password;

  if (!isValidEmail(email)) {
    return { error: "Enter a valid email", status: 400 };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters", status: 400 };
  }

  const users = await readJson<AuthUser>(USERS_FILE);
  if (users.some((u) => u.email === email)) {
    return { error: "An account with that email already exists", status: 409 };
  }

  const now = new Date().toISOString();
  const user: AuthUser = {
    id: `usr_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`,
    email,
    passwordHash: hashPassword(password),
    createdAt: now,
    updatedAt: now,
  };
  users.push(user);
  await writeJson(USERS_FILE, users);
  return { user: toPublic(user) };
}

export async function authenticateUser(input: {
  email: string;
  password: string;
}): Promise<{ user: PublicUser } | { error: string; status: number }> {
  const email = normalizeEmail(input.email);
  const users = await readJson<AuthUser>(USERS_FILE);
  const user = users.find((u) => u.email === email);
  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    return { error: "Invalid email or password", status: 401 };
  }
  return { user: toPublic(user) };
}

export async function createSession(userId: string): Promise<string> {
  const sessions = await readJson<SessionRecord>(SESSIONS_FILE);
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  const record: SessionRecord = {
    id: `ses_${now.toString(36)}_${randomBytes(3).toString("hex")}`,
    userId,
    tokenHash: hashToken(token),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  };
  sessions.push(record);
  const pruned = sessions.filter((s) => Date.parse(s.expiresAt) > now).slice(-2000);
  await writeJson(SESSIONS_FILE, pruned);
  return token;
}

export async function destroySession(token: string | undefined) {
  if (!token) return;
  const sessions = await readJson<SessionRecord>(SESSIONS_FILE);
  const tokenHash = hashToken(token);
  await writeJson(
    SESSIONS_FILE,
    sessions.filter((s) => s.tokenHash !== tokenHash),
  );
}

export async function getUserBySessionToken(
  token: string | undefined,
): Promise<PublicUser | null> {
  if (!token) return null;
  const sessions = await readJson<SessionRecord>(SESSIONS_FILE);
  const tokenHash = hashToken(token);
  const now = Date.now();
  const session = sessions.find(
    (s) => s.tokenHash === tokenHash && Date.parse(s.expiresAt) > now,
  );
  if (!session) return null;
  const users = await readJson<AuthUser>(USERS_FILE);
  const user = users.find((u) => u.id === session.userId);
  return user ? toPublic(user) : null;
}

export async function getCurrentUser(): Promise<PublicUser | null> {
  const jar = await cookies();
  return getUserBySessionToken(jar.get(SESSION_COOKIE)?.value);
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function listUsers(): Promise<PublicUser[]> {
  const users = await readJson<AuthUser>(USERS_FILE);
  return users
    .map(toPublic)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function resetUserPassword(input: {
  userId: string;
  newPassword: string;
}): Promise<{ ok: true } | { error: string; status: number }> {
  if (input.newPassword.length < 8) {
    return { error: "Password must be at least 8 characters", status: 400 };
  }
  const users = await readJson<AuthUser>(USERS_FILE);
  const user = users.find((u) => u.id === input.userId);
  if (!user) {
    return { error: "User not found", status: 404 };
  }
  user.passwordHash = hashPassword(input.newPassword);
  user.updatedAt = new Date().toISOString();
  await writeJson(USERS_FILE, users);

  const sessions = await readJson<SessionRecord>(SESSIONS_FILE);
  await writeJson(
    SESSIONS_FILE,
    sessions.filter((s) => s.userId !== input.userId),
  );
  return { ok: true };
}

export { SESSION_COOKIE };
