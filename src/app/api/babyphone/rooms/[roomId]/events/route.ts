import { NextRequest } from "next/server";
import { subscribe, type RoomEvent } from "@/lib/babyphone/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await context.params;
  const peerId = request.nextUrl.searchParams.get("peerId");
  if (!peerId) {
    return new Response(JSON.stringify({ error: "peerId required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  let cleanup: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: RoomEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      const result = subscribe(roomId, peerId, send);
      if ("error" in result) {
        send({ type: "error", message: result.error });
        controller.close();
        return;
      }
      cleanup = result;

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          if (heartbeat) clearInterval(heartbeat);
        }
      }, 15000);

      request.signal.addEventListener("abort", () => {
        if (heartbeat) clearInterval(heartbeat);
        cleanup?.();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
