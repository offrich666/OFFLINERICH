import { NextRequest, NextResponse } from "next/server";
import {
  createSession,
  registerUser,
  setSessionCookie,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await registerUser({
    email: body.email ?? "",
    password: body.password ?? "",
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const token = await createSession(result.user.id);
  await setSessionCookie(token);
  return NextResponse.json({ ok: true, user: result.user });
}
