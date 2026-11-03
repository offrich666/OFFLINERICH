import { NextResponse } from "next/server";
import { createRoom } from "@/lib/babyphone/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const room = createRoom();
  return NextResponse.json({ roomId: room.id });
}
