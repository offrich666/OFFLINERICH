import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  clearSessionCookie,
  destroySession,
} from "@/lib/auth";

export async function POST() {
  const jar = await cookies();
  await destroySession(jar.get(SESSION_COOKIE)?.value);
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
