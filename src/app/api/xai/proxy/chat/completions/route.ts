import { connection } from "next/server";
import { NextResponse } from "next/server";
import { assertOpsKey, recordXaiUsage, ticksToUsd } from "@/lib/xaiUsage";

/**
 * OpenAI-compatible proxy. Clients auth with OPS_SECRET (Bearer or x-ops-key).
 * Server injects XAI_API_KEY and records token usage for the dashboard.
 */
export async function POST(req: Request) {
  await connection();

  const auth = req.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  const opsKey = bearer || req.headers.get("x-ops-key") || "";
  if (!assertOpsKey(opsKey)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "XAI_API_KEY is not configured on the server" },
      { status: 503 },
    );
  }

  const payload = await req.text();
  let model: string | undefined;
  try {
    model = (JSON.parse(payload) as { model?: string }).model;
  } catch {
    // forward raw body anyway
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
      note: "proxy /chat/completions",
    });
  }

  return new NextResponse(text, {
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
    },
  });
}
