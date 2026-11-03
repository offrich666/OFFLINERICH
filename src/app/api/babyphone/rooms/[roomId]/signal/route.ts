import { NextRequest, NextResponse } from "next/server";
import { postSignal } from "@/lib/babyphone/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await context.params;
  let body: {
    from?: string;
    to?: string;
    kind?: string;
    payload?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.from || !body.to || !body.kind) {
    return NextResponse.json({ error: "from, to, and kind are required" }, { status: 400 });
  }
  if (body.kind !== "offer" && body.kind !== "answer" && body.kind !== "ice") {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  const result = postSignal(roomId, {
    from: body.from,
    to: body.to,
    kind: body.kind,
    payload: body.payload,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
