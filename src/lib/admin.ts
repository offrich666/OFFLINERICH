import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { cookies } from "next/headers";

const DATA_DIR =
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? path.join("/tmp", "offlinerich-data")
    : path.join(process.cwd(), "data");
const ADMIN_SESSIONS_FILE = path.join(DATA_DIR, "admin-sessions.json");

const ADMIN_COOKIE = "or_admin";
const ADMIN_SESSION_HOURS = 12;

type AdminSession = {
  id: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
};

function adminUsername() {
  return (process.env.ADMIN_USERNAME || "offlinerich").trim().toLowerCase();
}

function adminPassword() {
  return process.env.ADMIN_PASSWORD || "nukpoban";
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function safeEqualString(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

async function ensureFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(ADMIN_SESSIONS_FILE);
  } catch {
    await fs.writeFile(ADMIN_SESSIONS_FILE, "[]\n", "utf8");
  }
}

async function readSessions(): Promise<AdminSession[]> {
  await ensureFile();
  const raw = await fs.readFile(ADMIN_SESSIONS_FILE, "utf8");
  try {
    return JSON.parse(raw) as AdminSession[];
  } catch {
    return [];
  }
}

async function writeSessions(rows: AdminSession[]) {
  await ensureFile();
  await fs.writeFile(
    ADMIN_SESSIONS_FILE,
    JSON.stringify(rows, null, 2) + "\n",
    "utf8",
  );
}

export function verifyAdminCredentials(username: string, password: string) {
  const userOk = safeEqualString(
    username.trim().toLowerCase(),
    adminUsername(),
  );
  const passOk = safeEqualString(password, adminPassword());
  return userOk && passOk;
}

export async function createAdminSession(): Promise<string> {
  const sessions = await readSessions();
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  sessions.push({
    id: `adm_${now.toString(36)}_${randomBytes(3).toString("hex")}`,
    tokenHash: hashToken(token),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(
      now + ADMIN_SESSION_HOURS * 60 * 60 * 1000,
    ).toISOString(),
  });
  await writeSessions(
    sessions.filter((s) => Date.parse(s.expiresAt) > now).slice(-50),
  );
  return token;
}

export async function destroyAdminSession(token: string | undefined) {
  if (!token) return;
  const sessions = await readSessions();
  const tokenHash = hashToken(token);
  await writeSessions(sessions.filter((s) => s.tokenHash !== tokenHash));
}

export async function isAdminAuthenticated(
  token?: string,
): Promise<boolean> {
  const value =
    token ?? (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!value) return false;
  const sessions = await readSessions();
  const tokenHash = hashToken(value);
  const now = Date.now();
  return sessions.some(
    (s) => s.tokenHash === tokenHash && Date.parse(s.expiresAt) > now,
  );
}

export async function setAdminSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_HOURS * 60 * 60,
  });
}

export async function clearAdminSessionCookie() {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export { ADMIN_COOKIE };