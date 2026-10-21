import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function assertAdmin(): Promise<NextResponse | null> {
  const session = await getSession();
  if (!session.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
