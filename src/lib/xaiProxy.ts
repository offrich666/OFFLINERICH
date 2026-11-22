import "server-only";
import { assertOpsKey, recordXaiUsage, ticksToUsd } from "@/lib/xaiUsage";

const DEFAULT_GROK_MODEL = process.env.XAI_DEFAULT_MODEL?.trim() || "grok-4.3";
const MAX_HITS = 40;
const HITS_KEY = "__offlinerich_xai_proxy_hits__";

export type ProxyHit = {
  id: string;
  at: string;
  method: string;
  path: string;
  status: number;
  authOk: boolean;
  model?: string;
  note?: string;
};

function hitsStore(): ProxyHit[] {
  const g = globalThis as typeof globalThis & { [HITS_KEY]?: ProxyHit[] };
  if (!g[HITS_KEY]) g[HITS_KEY] = [];
  return g[HITS_KEY]!;
}

export function getProxyHits(): ProxyHit[] {
  return hitsStore().slice(0, MAX_HITS);
}

function pushHit(hit: Omit<ProxyHit, "id" | "at"> & { at?: string }) {
  const hits = hitsStore();
  hits.unshift({
    id: `hit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    at: hit.at || new Date().toISOString(),
    method: hit.method,
    path: hit.path,
    status: hit.status,
    authOk: hit.authOk,
    model: hit.model,
    note: hit.note,
  });
  if (hits.length > MAX_HITS) hits.length = MAX_HITS;
}

export function extractOpsKey(req: Request): string {
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  return (
    bearer ||
    req.headers.get("x-ops-key") ||
    req.headers.get("x-api-key") ||
    ""
  );
}

/** Accept OPS_SECRET or the real XAI_API_KEY (Cursor may paste either). */
export function assertProxyAuth(key: string | null | undefined): boolean {
  if (!key) return false;
  if (assertOpsKey(key)) return true;
  const xai = process.env.XAI_API_KEY?.trim();
  return Boolean(xai) && key === xai;
}

export function requireProxyAuth(req: Request): Response | null {
  if (!assertProxyAuth(extractOpsKey(req))) {
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

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, x-ops-key, x-api-key, OpenAI-Organization, OpenAI-Project",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

/** Cursor may send gpt-* / auto — remap anything non-grok to the default Grok id. */
export function remapModel(model: string | undefined): {
  model: string;
  remapped: boolean;
  original?: string;
} {
  const raw = (model || "").trim();
  if (!raw) {
    return { model: DEFAULT_GROK_MODEL, remapped: true, original: model };
  }
  if (/^grok/i.test(raw)) {
    return { model: raw, remapped: false };
  }
  return { model: DEFAULT_GROK_MODEL, remapped: true, original: raw };
}

type ChatCompletionBody = {
  model?: string;
  stream?: boolean;
  stream_options?: { include_usage?: boolean };
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost_in_usd_ticks?: number;
  };
};

function requestPath(req: Request): string {
  try {
    return new URL(req.url).pathname;
  } catch {
    return "/api/xai/v1";
  }
}

async function recordFromUsage(
  usage: ChatCompletionBody["usage"] | undefined,
  model: string,
  note: string,
) {
  if (!usage?.total_tokens) return;
  await recordXaiUsage({
    source: "proxy",
    model,
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens,
    costUsd: ticksToUsd(usage.cost_in_usd_ticks),
    note,
  });
}

function extractUsageFromSse(chunkText: string): ChatCompletionBody["usage"] | null {
  let found: ChatCompletionBody["usage"] | null = null;
  for (const line of chunkText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const parsed = JSON.parse(data) as ChatCompletionBody;
      if (parsed.usage?.total_tokens) found = parsed.usage;
    } catch {
      // ignore partial JSON
    }
  }
  return found;
}

export async function proxyChatCompletions(req: Request): Promise<Response> {
  const path = requestPath(req);
  const denied = requireProxyAuth(req);
  if (denied) {
    pushHit({
      method: "POST",
      path,
      status: denied.status,
      authOk: false,
      note: "auth failed",
    });
    return denied;
  }

  const apiKey = process.env.XAI_API_KEY!.trim();
  const payloadText = await req.text();
  let payload: ChatCompletionBody = {};
  try {
    payload = JSON.parse(payloadText) as ChatCompletionBody;
  } catch {
    pushHit({
      method: "POST",
      path,
      status: 400,
      authOk: true,
      note: "invalid json body",
    });
    return Response.json({ error: "invalid json body" }, { status: 400 });
  }

  const mapped = remapModel(payload.model);
  const wantsStream = Boolean(payload.stream);
  const forwardBody: ChatCompletionBody = {
    ...payload,
    model: mapped.model,
  };
  if (wantsStream) {
    forwardBody.stream_options = {
      ...(payload.stream_options || {}),
      include_usage: true,
    };
  }

  const upstream = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(forwardBody),
    cache: "no-store",
  });

  const contentType = upstream.headers.get("content-type") || "";
  const noteParts = [
    "live proxy /chat/completions",
    wantsStream ? "stream" : "json",
    mapped.remapped ? `remap:${mapped.original || "empty"}→${mapped.model}` : null,
  ].filter(Boolean);

  if (wantsStream || contentType.includes("text/event-stream")) {
    if (!upstream.body) {
      pushHit({
        method: "POST",
        path,
        status: 502,
        authOk: true,
        model: mapped.model,
        note: "missing stream body",
      });
      return Response.json({ error: "upstream stream missing" }, { status: 502 });
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let recorded = false;

    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          if (!recorded) {
            const usage = extractUsageFromSse(buffer);
            if (usage) {
              await recordFromUsage(usage, mapped.model, noteParts.join(" "));
              recorded = true;
            }
          }
          controller.close();
          return;
        }
        const text = decoder.decode(value, { stream: true });
        buffer += text;
        if (buffer.length > 64_000) buffer = buffer.slice(-64_000);
        if (!recorded) {
          const usage = extractUsageFromSse(text);
          if (usage) {
            await recordFromUsage(usage, mapped.model, noteParts.join(" "));
            recorded = true;
          }
        }
        controller.enqueue(value);
      },
      cancel() {
        reader.cancel().catch(() => undefined);
      },
    });

    pushHit({
      method: "POST",
      path,
      status: upstream.status,
      authOk: true,
      model: mapped.model,
      note: noteParts.join(" "),
    });

    return new Response(stream, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType || "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        ...corsHeaders(),
      },
    });
  }

  const text = await upstream.text();
  let parsed: ChatCompletionBody | null = null;
  try {
    parsed = JSON.parse(text) as ChatCompletionBody;
  } catch {
    parsed = null;
  }

  if (upstream.ok && parsed?.usage?.total_tokens) {
    await recordFromUsage(parsed.usage, parsed.model || mapped.model, noteParts.join(" "));
  }

  pushHit({
    method: "POST",
    path,
    status: upstream.status,
    authOk: true,
    model: mapped.model,
    note: noteParts.join(" "),
  });

  return new Response(text, {
    status: upstream.status,
    headers: {
      "Content-Type": contentType || "application/json",
      "x-ratelimit-limit-tokens":
        upstream.headers.get("x-ratelimit-limit-tokens") || "",
      "x-ratelimit-remaining-tokens":
        upstream.headers.get("x-ratelimit-remaining-tokens") || "",
      "x-ratelimit-limit-requests":
        upstream.headers.get("x-ratelimit-limit-requests") || "",
      "x-ratelimit-remaining-requests":
        upstream.headers.get("x-ratelimit-remaining-requests") || "",
      ...corsHeaders(),
    },
  });
}

type ResponsesBody = {
  model?: string;
  stream?: boolean;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    cost_in_usd_ticks?: number;
  };
};

/** Cursor Agent often uses OpenAI Responses API (/v1/responses). */
export async function proxyResponses(req: Request): Promise<Response> {
  const path = requestPath(req);
  const denied = requireProxyAuth(req);
  if (denied) {
    pushHit({
      method: "POST",
      path,
      status: denied.status,
      authOk: false,
      note: "responses auth failed",
    });
    return denied;
  }

  const apiKey = process.env.XAI_API_KEY!.trim();
  const payloadText = await req.text();
  let payload: ResponsesBody = {};
  try {
    payload = JSON.parse(payloadText) as ResponsesBody;
  } catch {
    pushHit({
      method: "POST",
      path,
      status: 400,
      authOk: true,
      note: "responses invalid json",
    });
    return Response.json({ error: "invalid json body" }, { status: 400 });
  }

  const mapped = remapModel(payload.model);
  const forwardBody = { ...payload, model: mapped.model };
  const upstream = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(forwardBody),
    cache: "no-store",
  });

  const contentType = upstream.headers.get("content-type") || "";
  const noteParts = [
    "live proxy /responses",
    payload.stream ? "stream" : "json",
    mapped.remapped ? `remap:${mapped.original || "empty"}→${mapped.model}` : null,
  ].filter(Boolean);

  if (payload.stream || contentType.includes("text/event-stream")) {
    if (!upstream.body) {
      pushHit({
        method: "POST",
        path,
        status: 502,
        authOk: true,
        model: mapped.model,
        note: "responses missing stream",
      });
      return Response.json({ error: "upstream stream missing" }, { status: 502 });
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let recorded = false;

    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          if (!recorded) {
            const usage = extractResponsesUsageFromSse(buffer);
            if (usage?.total_tokens) {
              await recordXaiUsage({
                source: "proxy",
                model: mapped.model,
                promptTokens: usage.input_tokens ?? 0,
                completionTokens: usage.output_tokens ?? 0,
                totalTokens: usage.total_tokens,
                costUsd: ticksToUsd(usage.cost_in_usd_ticks),
                note: noteParts.join(" "),
              });
              recorded = true;
            }
          }
          controller.close();
          return;
        }
        const text = decoder.decode(value, { stream: true });
        buffer += text;
        if (buffer.length > 64_000) buffer = buffer.slice(-64_000);
        if (!recorded) {
          const usage = extractResponsesUsageFromSse(text);
          if (usage?.total_tokens) {
            await recordXaiUsage({
              source: "proxy",
              model: mapped.model,
              promptTokens: usage.input_tokens ?? 0,
              completionTokens: usage.output_tokens ?? 0,
              totalTokens: usage.total_tokens,
              costUsd: ticksToUsd(usage.cost_in_usd_ticks),
              note: noteParts.join(" "),
            });
            recorded = true;
          }
        }
        controller.enqueue(value);
      },
      cancel() {
        reader.cancel().catch(() => undefined);
      },
    });

    pushHit({
      method: "POST",
      path,
      status: upstream.status,
      authOk: true,
      model: mapped.model,
      note: noteParts.join(" "),
    });

    return new Response(stream, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType || "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        ...corsHeaders(),
      },
    });
  }

  const text = await upstream.text();
  let parsed: ResponsesBody | null = null;
  try {
    parsed = JSON.parse(text) as ResponsesBody;
  } catch {
    parsed = null;
  }

  if (upstream.ok && parsed?.usage?.total_tokens) {
    await recordXaiUsage({
      source: "proxy",
      model: mapped.model,
      promptTokens: parsed.usage.input_tokens ?? 0,
      completionTokens: parsed.usage.output_tokens ?? 0,
      totalTokens: parsed.usage.total_tokens,
      costUsd: ticksToUsd(parsed.usage.cost_in_usd_ticks),
      note: noteParts.join(" "),
    });
  }

  pushHit({
    method: "POST",
    path,
    status: upstream.status,
    authOk: true,
    model: mapped.model,
    note: noteParts.join(" "),
  });

  return new Response(text, {
    status: upstream.status,
    headers: {
      "Content-Type": contentType || "application/json",
      ...corsHeaders(),
    },
  });
}

function extractResponsesUsageFromSse(
  chunkText: string,
): ResponsesBody["usage"] | null {
  let found: ResponsesBody["usage"] | null = null;
  for (const line of chunkText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const parsed = JSON.parse(data) as {
        usage?: ResponsesBody["usage"];
        response?: ResponsesBody;
        type?: string;
      };
      const usage = parsed.usage || parsed.response?.usage;
      if (usage?.total_tokens) found = usage;
    } catch {
      // ignore
    }
  }
  return found;
}

export async function proxyModels(req: Request): Promise<Response> {
  const path = requestPath(req);
  const denied = requireProxyAuth(req);
  if (denied) {
    pushHit({
      method: "GET",
      path,
      status: denied.status,
      authOk: false,
      note: "models auth failed",
    });
    return denied;
  }

  const apiKey = process.env.XAI_API_KEY!.trim();
  const upstream = await fetch("https://api.x.ai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  const text = await upstream.text();
  pushHit({
    method: "GET",
    path,
    status: upstream.status,
    authOk: true,
    note: "models list",
  });
  return new Response(text, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/json",
      ...corsHeaders(),
    },
  });
}

export function corsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(),
      "Access-Control-Max-Age": "86400",
    },
  });
}

export function logUnknownProxyHit(
  req: Request,
  status: number,
  note: string,
): void {
  pushHit({
    method: req.method,
    path: requestPath(req),
    status,
    authOk: assertProxyAuth(extractOpsKey(req)),
    note,
  });
}
