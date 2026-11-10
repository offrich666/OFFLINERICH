import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_COOKIE,
  clearAdminSessionCookie,
  destroyAdminSession,
} from "@/lib/admin";

export async function POST() {
  const jar = await cookies();
  await destroyAdminSession(jar.get(ADMIN_COOKIE)?.value);
  await clearAdminSessionCookie();
  return NextResponse.json({ ok: true });
}
