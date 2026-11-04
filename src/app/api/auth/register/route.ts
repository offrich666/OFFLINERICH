import { NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth";
import { publicUser, registerUser } from "@/lib/users";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      password?: string;
    };

    const result = await registerUser({
      name: String(body.name || ""),
      email: String(body.email || ""),
      password: String(body.password || ""),
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await setSessionCookie(result.user.id);
    return NextResponse.json({ user: publicUser(result.user) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
