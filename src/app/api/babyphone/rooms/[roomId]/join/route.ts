import { NextRequest, NextResponse } from "next/server";
import { joinRoom, type DeviceRole } from "@/lib/babyphone/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await context.params;
  let body: { name?: string; role?: string; peerId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const role = body.role === "camera" || body.role === "remoter" ? (body.role as DeviceRole) : null;
  if (!role) {
    return NextResponse.json({ error: "Role must be camera or remoter" }, { status: 400 });
  }

  const result = joinRoom(roomId, {
    name: typeof body.name === "string" ? body.name : "",
    role,
    peerId: typeof body.peerId === "string" ? body.peerId : undefined,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    roomId: result.room.id,
    peer: result.peer,
  });
}
