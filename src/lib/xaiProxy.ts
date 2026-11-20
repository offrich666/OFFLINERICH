import "server-only";
import { assertOpsKey, recordXaiUsage, ticksToUsd } from "@/lib/xaiUsage";

export function extractOpsKey(req: Request): string {
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  return bearer || req.headers.get("x-ops-key") || "";
}

export function requireProxyAuth(req: Request): Response | null {
  if (!assertOpsKey(extractOpsKey(req))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.XAI_API_KEY?.trim()) {
    return Response.json(
      { error: "XAI_API_KEY is not configured on the server" },
      { status: 503 },
    );
  }
  return null;
}

export async function proxyChatCompletions(req: Request): Promise<Response> {
  const denied = requireProxyAuth(req);
  if (denied) return denied;

  const apiKey = process.env.XAI_API_KEY!.trim();
  const payload = await req.text();
  let model: string | undefined;
  try {
    model = (JSON.parse(payload) as { model?: string }).model;
  } catch {
    // forward raw body
  }

  const upstream = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: payload,
    cache: "no-store",
  });

  const text = await upstream.text();
  type ChatCompletionBody = {
    model?: string;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      cost_in_usd_ticks?: number;
    };
  };
  let parsed: ChatCompletionBody | null = null;
  try {
    parsed = JSON.parse(text) as ChatCompletionBody;
  } catch {
    parsed = null;
  }

  const usage = parsed?.usage;
  if (upstream.ok && usage?.total_tokens) {
    await recordXaiUsage({
      source: "proxy",
      model: parsed?.model || model,
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
      totalTokens: usage.total_tokens,
      costUsd: ticksToUsd(usage.cost_in_usd_ticks),
      note: "live proxy /v1/chat/completions",
    });
  }

  return new Response(text, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/json",
      "x-ratelimit-limit-tokens":
        upstream.headers.get("x-ratelimit-limit-tokens") || "",
      "x-ratelimit-remaining-tokens":
        upstream.headers.get("x-ratelimit-remaining-tokens") || "",
      "x-ratelimit-limit-requests":
        upstream.headers.get("x-ratelimit-limit-requests") || "",
      "x-ratelimit-remaining-requests":
        upstream.headers.get("x-ratelimit-remaining-requests") || "",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, x-ops-key",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });
}

export async function proxyModels(req: Request): Promise<Response> {
  const denied = requireProxyAuth(req);
  if (denied) return denied;

  const apiKey = process.env.XAI_API_KEY!.trim();
  const upstream = await fetch("https://api.x.ai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, x-ops-key",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });
}

export function corsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, x-ops-key",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
