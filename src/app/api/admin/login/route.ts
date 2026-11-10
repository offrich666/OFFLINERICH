import { NextRequest, NextResponse } from "next/server";
import {
  createAdminSession,
  setAdminSessionCookie,
  verifyAdminCredentials,
} from "@/lib/admin";

export async function POST(request: NextRequest) {
  let body: { username?: string; password?: string };
  try {
    body = (await request.json()) as { username?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    !verifyAdminCredentials(body.username ?? "", body.password ?? "")
  ) {
    return NextResponse.json({ error: "Invalid admin credentials" }, { status: 401 });
  }

  const token = await createAdminSession();
  await setAdminSessionCookie(token);
  return NextResponse.json({ ok: true });
}
