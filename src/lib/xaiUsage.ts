import "server-only";
import { promises as fs } from "fs";
import path from "path";

export type XaiUsageEvent = {
  id: string;
  at: string;
  source: "proxy" | "manual" | "probe";
  model?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd?: number;
  note?: string;
};

export type XaiUsageState = {
  totalTokens: number;
  totalCostUsd: number;
  alertThresholdTokens: number;
  alertFiredAt: string | null;
  lastAlertTokens: number | null;
  webhookUrl: string | null;
  events: XaiUsageEvent[];
  updatedAt: string;
};

/** Vercel serverless FS is read-only except /tmp. Local/dev uses ./data. */
const DATA_DIR =
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? path.join("/tmp", "offlinerich-data")
    : path.join(process.cwd(), "data");
const USAGE_FILE = path.join(DATA_DIR, "xai-usage.json");

const DEFAULT_THRESHOLD = 30_000;
const MAX_EVENTS = 200;

/** Dashboard pricing: 1 token = $1 (override with XAI_USD_PER_TOKEN). */
export const USD_PER_TOKEN = (() => {
  const raw = Number(process.env.XAI_USD_PER_TOKEN || 1);
  return Number.isFinite(raw) && raw >= 0 ? raw : 1;
})();

/** xAI billed ticks (reference only): 10_000_000_000 ticks = $1. */
export const XAI_TICKS_PER_USD = 10_000_000_000;

export type XaiModelRate = {
  id: string;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  usdPerToken: number;
};

export type XaiCostSummary = {
  totalCostUsd: number;
  billedCostUsd: number;
  estimatedFromRatesUsd: number;
  usdPerToken: number;
  promptTokens: number;
  completionTokens: number;
  otherTokens: number;
  avgUsdPer1kTokens: number | null;
  byModel: Array<{
    model: string;
    tokens: number;
    costUsd: number;
    usdPerToken: number;
    inputUsdPerMillion: number | null;
    outputUsdPerMillion: number | null;
  }>;
};

export function costForTokens(tokens: number): number {
  return Math.max(0, tokens) * USD_PER_TOKEN;
}

export function ticksToUsd(ticks: number | undefined): number | undefined {
  if (ticks == null || !Number.isFinite(ticks)) return undefined;
  return ticks / XAI_TICKS_PER_USD;
}

let pricingCache:
  | { at: number; rates: XaiModelRate[]; byId: Map<string, XaiModelRate> }
  | null = null;

export async function getXaiModelRates(): Promise<XaiModelRate[]> {
  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) return pricingCache?.rates ?? [];

  if (pricingCache && Date.now() - pricingCache.at < 5 * 60_000) {
    return pricingCache.rates;
  }

  try {
    const res = await fetch("https://api.x.ai/v1/language-models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as {
      models?: Array<{
        id: string;
        aliases?: string[];
        prompt_text_token_price?: number;
        completion_text_token_price?: number;
        cached_prompt_text_token_price?: number;
      }>;
    } | null;
    if (!res.ok || !body?.models) return pricingCache?.rates ?? [];

    const rates: XaiModelRate[] = [];
    const byId = new Map<string, XaiModelRate>();
    for (const model of body.models) {
      // Dashboard uses flat $1/token; still list models so the price table is clear.
      const rate: XaiModelRate = {
        id: model.id,
        usdPerToken: USD_PER_TOKEN,
        inputUsdPerMillion: USD_PER_TOKEN * 1_000_000,
        outputUsdPerMillion: USD_PER_TOKEN * 1_000_000,
        cachedInputUsdPerMillion: USD_PER_TOKEN * 1_000_000,
      };
      rates.push(rate);
      byId.set(model.id, rate);
      for (const alias of model.aliases || []) byId.set(alias, rate);
    }
    pricingCache = { at: Date.now(), rates, byId };
    return rates;
  } catch {
    return pricingCache?.rates ?? [];
  }
}

export function findModelRate(
  model: string | undefined,
  byId?: Map<string, XaiModelRate>,
): XaiModelRate | null {
  if (!model) return null;
  const map = byId ?? pricingCache?.byId;
  if (!map) return null;
  return map.get(model) || null;
}

export function buildCostSummary(
  usage: XaiUsageState,
  rates: XaiModelRate[],
): XaiCostSummary {
  const byId = pricingCache?.byId ?? new Map(rates.map((r) => [r.id, r]));
  let promptTokens = 0;
  let completionTokens = 0;
  let otherTokens = 0;
  const modelMap = new Map<
    string,
    { tokens: number; costUsd: number; rate: XaiModelRate | null }
  >();

  for (const event of usage.events) {
    promptTokens += event.promptTokens || 0;
    completionTokens += event.completionTokens || 0;
    otherTokens += Math.max(
      0,
      event.totalTokens - (event.promptTokens || 0) - (event.completionTokens || 0),
    );

    const estimated = costForTokens(event.totalTokens);
    const rate = findModelRate(event.model, byId);
    const key = event.model || "unknown";
    const row = modelMap.get(key) || { tokens: 0, costUsd: 0, rate };
    row.tokens += event.totalTokens;
    row.costUsd += estimated;
    row.rate = row.rate || rate;
    modelMap.set(key, row);
  }

  const totalCostUsd = costForTokens(usage.totalTokens);
  return {
    totalCostUsd,
    billedCostUsd: totalCostUsd,
    estimatedFromRatesUsd: totalCostUsd,
    usdPerToken: USD_PER_TOKEN,
    promptTokens,
    completionTokens,
    otherTokens,
    avgUsdPer1kTokens:
      usage.totalTokens > 0 ? (totalCostUsd / usage.totalTokens) * 1000 : null,
    byModel: [...modelMap.entries()]
      .map(([model, row]) => ({
        model,
        tokens: row.tokens,
        costUsd: row.costUsd,
        usdPerToken: USD_PER_TOKEN,
        inputUsdPerMillion: USD_PER_TOKEN * 1_000_000,
        outputUsdPerMillion: USD_PER_TOKEN * 1_000_000,
      }))
      .sort((a, b) => b.costUsd - a.costUsd),
  };
}

function defaultState(): XaiUsageState {
  const threshold = Number(process.env.XAI_TOKEN_ALERT_THRESHOLD || DEFAULT_THRESHOLD);
  return {
    totalTokens: 0,
    totalCostUsd: 0,
    alertThresholdTokens: Number.isFinite(threshold) && threshold > 0 ? threshold : DEFAULT_THRESHOLD,
    alertFiredAt: null,
    lastAlertTokens: null,
    webhookUrl: process.env.XAI_ALERT_WEBHOOK_URL?.trim() || null,
    events: [],
    updatedAt: new Date().toISOString(),
  };
}

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(USAGE_FILE);
  } catch {
    await fs.writeFile(USAGE_FILE, JSON.stringify(defaultState(), null, 2) + "\n", "utf8");
  }
}

export async function getXaiUsage(): Promise<XaiUsageState> {
  await ensureStore();
  const raw = await fs.readFile(USAGE_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw) as Partial<XaiUsageState>;
    const base = defaultState();
    const events = (Array.isArray(parsed.events) ? parsed.events : []).map(
      (event) => ({
        ...event,
        costUsd: costForTokens(event.totalTokens || 0),
      }),
    );
    const totalTokens =
      typeof parsed.totalTokens === "number" && parsed.totalTokens >= 0
        ? parsed.totalTokens
        : events.reduce((sum, e) => sum + (e.totalTokens || 0), 0);
    return {
      ...base,
      ...parsed,
      events,
      totalTokens,
      totalCostUsd: costForTokens(totalTokens),
      alertThresholdTokens:
        typeof parsed.alertThresholdTokens === "number" && parsed.alertThresholdTokens > 0
          ? parsed.alertThresholdTokens
          : base.alertThresholdTokens,
    };
  } catch {
    return defaultState();
  }
}

async function writeState(state: XaiUsageState) {
  await ensureStore();
  state.updatedAt = new Date().toISOString();
  await fs.writeFile(USAGE_FILE, JSON.stringify(state, null, 2) + "\n", "utf8");
}

async function maybeAlert(state: XaiUsageState): Promise<XaiUsageState> {
  const crossed =
    state.totalTokens >= state.alertThresholdTokens &&
    (state.lastAlertTokens == null ||
      state.lastAlertTokens < state.alertThresholdTokens ||
      // Re-alert every additional full threshold step (30k, 60k, …)
      state.totalTokens >= (state.lastAlertTokens || 0) + state.alertThresholdTokens);

  if (!crossed) return state;

  const message = {
    text:
      `xAI usage alert: ${state.totalTokens.toLocaleString()} tokens spent ` +
      `($${costForTokens(state.totalTokens).toFixed(2)} at $${USD_PER_TOKEN}/token; ` +
      `threshold ${state.alertThresholdTokens.toLocaleString()}).`,
  };

  if (state.webhookUrl) {
    try {
      await fetch(state.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...message,
          content: message.text,
          totalTokens: state.totalTokens,
          threshold: state.alertThresholdTokens,
          totalCostUsd: state.totalCostUsd,
        }),
      });
    } catch {
      // Keep dashboard alert even if webhook fails.
    }
  }

  state.alertFiredAt = new Date().toISOString();
  state.lastAlertTokens = state.totalTokens;
  return state;
}

export async function recordXaiUsage(input: {
  source: XaiUsageEvent["source"];
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens: number;
  costUsd?: number;
  note?: string;
}): Promise<XaiUsageState> {
  const state = await getXaiUsage();
  const totalTokens = Math.max(0, Math.floor(input.totalTokens));
  const promptTokens = Math.max(0, Math.floor(input.promptTokens ?? 0));
  const completionTokens = Math.max(0, Math.floor(input.completionTokens ?? 0));

  // Flat dashboard price: 1 token = $1 (or XAI_USD_PER_TOKEN).
  const costUsd = costForTokens(totalTokens);

  const event: XaiUsageEvent = {
    id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    source: input.source,
    model: input.model,
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd: costUsd || undefined,
    note: input.note,
  };

  state.totalTokens += totalTokens;
  state.totalCostUsd = costForTokens(state.totalTokens);
  state.events = [event, ...state.events].slice(0, MAX_EVENTS);
  const next = await maybeAlert(state);
  await writeState(next);
  return next;
}

export async function updateXaiUsageSettings(input: {
  alertThresholdTokens?: number;
  webhookUrl?: string | null;
  reset?: boolean;
}): Promise<XaiUsageState> {
  if (input.reset) {
    const fresh = defaultState();
    if (typeof input.alertThresholdTokens === "number" && input.alertThresholdTokens > 0) {
      fresh.alertThresholdTokens = Math.floor(input.alertThresholdTokens);
    }
    if (input.webhookUrl !== undefined) {
      fresh.webhookUrl = input.webhookUrl?.trim() || null;
    }
    await writeState(fresh);
    return fresh;
  }

  const state = await getXaiUsage();
  if (typeof input.alertThresholdTokens === "number" && input.alertThresholdTokens > 0) {
    state.alertThresholdTokens = Math.floor(input.alertThresholdTokens);
    // Allow a new alert if threshold was raised above current spend, then crossed again later.
    if (state.totalTokens < state.alertThresholdTokens) {
      state.alertFiredAt = null;
      state.lastAlertTokens = null;
    }
  }
  if (input.webhookUrl !== undefined) {
    state.webhookUrl = input.webhookUrl?.trim() || null;
  }
  await writeState(state);
  return state;
}

export type XaiProbeResult = {
  ok: boolean;
  keyName?: string;
  keyBlocked?: boolean;
  teamBlocked?: boolean;
  redactedKey?: string;
  rateLimit?: {
    limitTokens?: number;
    remainingTokens?: number;
    limitRequests?: number;
    remainingRequests?: number;
  };
  sampleUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd?: number;
    model?: string;
  };
  error?: string;
};

export async function probeXaiKey(options?: {
  recordSample?: boolean;
}): Promise<XaiProbeResult> {
  const apiKey = process.env.XAI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "XAI_API_KEY is not set" };
  }

  try {
    const metaRes = await fetch("https://api.x.ai/v1/api-key", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    const meta = (await metaRes.json().catch(() => null)) as {
      name?: string;
      api_key_blocked?: boolean;
      team_blocked?: boolean;
      redacted_api_key?: string;
      error?: { message?: string };
    } | null;

    if (!metaRes.ok) {
      return {
        ok: false,
        error: meta?.error?.message || `api-key probe HTTP ${metaRes.status}`,
      };
    }

    const chatRes = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.XAI_PROBE_MODEL || "grok-3-mini",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
      cache: "no-store",
    });

    const limitTokens = Number(chatRes.headers.get("x-ratelimit-limit-tokens") || "");
    const remainingTokens = Number(chatRes.headers.get("x-ratelimit-remaining-tokens") || "");
    const limitRequests = Number(chatRes.headers.get("x-ratelimit-limit-requests") || "");
    const remainingRequests = Number(chatRes.headers.get("x-ratelimit-remaining-requests") || "");

    const body = (await chatRes.json().catch(() => null)) as {
      model?: string;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        cost_in_usd_ticks?: number;
      };
      error?: { message?: string };
    } | null;

    if (!chatRes.ok) {
      return {
        ok: false,
        keyName: meta?.name,
        keyBlocked: meta?.api_key_blocked,
        teamBlocked: meta?.team_blocked,
        redactedKey: meta?.redacted_api_key,
        error: body?.error?.message || `chat probe HTTP ${chatRes.status}`,
      };
    }

    const sampleUsage = {
      promptTokens: body?.usage?.prompt_tokens ?? 0,
      completionTokens: body?.usage?.completion_tokens ?? 0,
      totalTokens: body?.usage?.total_tokens ?? 0,
      costUsd: ticksToUsd(body?.usage?.cost_in_usd_ticks),
      model: body?.model,
    };

    if (options?.recordSample && sampleUsage.totalTokens > 0) {
      await recordXaiUsage({
        source: "probe",
        model: sampleUsage.model,
        promptTokens: sampleUsage.promptTokens,
        completionTokens: sampleUsage.completionTokens,
        totalTokens: sampleUsage.totalTokens,
        costUsd: sampleUsage.costUsd,
        note: "dashboard probe",
      });
    }

    return {
      ok: true,
      keyName: meta?.name,
      keyBlocked: Boolean(meta?.api_key_blocked),
      teamBlocked: Boolean(meta?.team_blocked),
      redactedKey: meta?.redacted_api_key,
      rateLimit: {
        limitTokens: Number.isFinite(limitTokens) ? limitTokens : undefined,
        remainingTokens: Number.isFinite(remainingTokens) ? remainingTokens : undefined,
        limitRequests: Number.isFinite(limitRequests) ? limitRequests : undefined,
        remainingRequests: Number.isFinite(remainingRequests) ? remainingRequests : undefined,
      },
      sampleUsage,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "probe_failed",
    };
  }
}

export function assertOpsKey(key: string | null | undefined): boolean {
  const expected = process.env.OPS_SECRET || "";
  return Boolean(expected) && key === expected;
}
