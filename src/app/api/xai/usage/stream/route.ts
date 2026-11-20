import { connection } from "next/server";
import {
  assertOpsKey,
  buildCostSummary,
  getXaiModelRates,
  getXaiUsage,
} from "@/lib/xaiUsage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Live SSE feed — dashboard auto-updates when proxy spend is recorded.
 */
export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  const key = url.searchParams.get("key") || req.headers.get("x-ops-key");
  if (!assertOpsKey(key)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  let closed = false;
  let lastStamp = "";

  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => {
        if (closed) return;
        try {
          const usage = await getXaiUsage();
          const rates = await getXaiModelRates();
          const cost = buildCostSummary(usage, rates);
          const stamp = `${usage.updatedAt}:${usage.totalTokens}:${usage.events[0]?.id || ""}`;
          if (stamp === lastStamp) return;
          lastStamp = stamp;
          const payload = JSON.stringify({
            usage,
            cost,
            rates: rates.slice(0, 40).map((r) => ({
              id: r.id,
              usdPerToken: r.usdPerToken,
              inputUsdPerMillion: r.inputUsdPerMillion,
              outputUsdPerMillion: r.outputUsdPerMillion,
              cachedInputUsdPerMillion: r.cachedInputUsdPerMillion,
            })),
            live: true,
            at: new Date().toISOString(),
          });
          controller.enqueue(encoder.encode(`event: usage\ndata: ${payload}\n\n`));
        } catch {
          // keep stream alive
        }
      };

      await send();
      const timer = setInterval(() => {
        void send();
      }, 1500);

      const ping = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          // closed
        }
      }, 15000);

      const abort = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        clearInterval(ping);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      req.signal.addEventListener("abort", abort);
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
