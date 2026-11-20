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

/** xAI: 10_000_000_000 ticks = $1 */
export function ticksToUsd(ticks: number | undefined): number | undefined {
  if (ticks == null || !Number.isFinite(ticks)) return undefined;
  return ticks / 10_000_000_000;
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
    return {
      ...base,
      ...parsed,
      events: Array.isArray(parsed.events) ? parsed.events : [],
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
      `(threshold ${state.alertThresholdTokens.toLocaleString()}). ` +
      `Est. cost $${state.totalCostUsd.toFixed(4)}.`,
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
  const costUsd = input.costUsd && Number.isFinite(input.costUsd) ? input.costUsd : 0;

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
  state.totalCostUsd += costUsd;
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
