import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { findUserById, publicUser, type UserRecord } from "@/lib/users";

const COOKIE = "fxl_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 14; // 14 days

function sessionSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.OPS_SECRET ||
    "funded-xl-dev-secret-change-me"
  );
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function createSessionToken(userId: string): string {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC;
  const body = `${userId}.${exp}`;
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string): { userId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;
  const body = `${userId}.${expStr}`;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  return { userId };
}

export async function setSessionCookie(userId: string) {
  const jar = await cookies();
  jar.set(COOKIE, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSessionUser(): Promise<UserRecord | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const parsed = verifySessionToken(token);
  if (!parsed) return null;
  return findUserById(parsed.userId);
}

export async function requireSessionUser(): Promise<UserRecord> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

export { publicUser, COOKIE as SESSION_COOKIE };
