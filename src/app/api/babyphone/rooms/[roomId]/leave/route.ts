import { NextRequest, NextResponse } from "next/server";
import { leaveRoom } from "@/lib/babyphone/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await context.params;
  let body: { peerId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.peerId) {
    return NextResponse.json({ error: "peerId required" }, { status: 400 });
  }
  leaveRoom(roomId, body.peerId);
  return NextResponse.json({ ok: true });
}
