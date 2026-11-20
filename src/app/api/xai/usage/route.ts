import { connection } from "next/server";
import { NextResponse } from "next/server";
import {
  assertOpsKey,
  getXaiUsage,
  probeXaiKey,
  recordXaiUsage,
  updateXaiUsageSettings,
} from "@/lib/xaiUsage";

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  const key = url.searchParams.get("key") || req.headers.get("x-ops-key");
  if (!assertOpsKey(key)) return unauthorized();

  const includeProbe = url.searchParams.get("probe") === "1";
  const usage = await getXaiUsage();
  const probe = includeProbe ? await probeXaiKey({ recordSample: false }) : null;

  return NextResponse.json({
    usage,
    probe,
    progress: {
      tokens: usage.totalTokens,
      threshold: usage.alertThresholdTokens,
      percent: Math.min(
        100,
        Math.round((usage.totalTokens / Math.max(1, usage.alertThresholdTokens)) * 100),
      ),
      alertActive: usage.totalTokens >= usage.alertThresholdTokens,
    },
  });
}

export async function POST(req: Request) {
  await connection();
  const url = new URL(req.url);
  const headerKey = req.headers.get("x-ops-key");
  const body = (await req.json().catch(() => ({}))) as {
    key?: string;
    action?: "ingest" | "settings" | "reset" | "probe";
    totalTokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    model?: string;
    costUsd?: number;
    note?: string;
    alertThresholdTokens?: number;
    webhookUrl?: string | null;
    recordSample?: boolean;
  };

  const key = body.key || url.searchParams.get("key") || headerKey;
  if (!assertOpsKey(key)) return unauthorized();

  const action = body.action || "ingest";

  if (action === "settings") {
    const usage = await updateXaiUsageSettings({
      alertThresholdTokens: body.alertThresholdTokens,
      webhookUrl: body.webhookUrl,
    });
    return NextResponse.json({ ok: true, usage });
  }

  if (action === "reset") {
    const usage = await updateXaiUsageSettings({
      reset: true,
      alertThresholdTokens: body.alertThresholdTokens,
      webhookUrl: body.webhookUrl,
    });
    return NextResponse.json({ ok: true, usage });
  }

  if (action === "probe") {
    const probe = await probeXaiKey({ recordSample: Boolean(body.recordSample) });
    const usage = await getXaiUsage();
    return NextResponse.json({ ok: probe.ok, probe, usage });
  }

  if (!body.totalTokens || body.totalTokens <= 0) {
    return NextResponse.json({ error: "totalTokens required" }, { status: 400 });
  }

  const usage = await recordXaiUsage({
    source: "manual",
    model: body.model,
    promptTokens: body.promptTokens,
    completionTokens: body.completionTokens,
    totalTokens: body.totalTokens,
    costUsd: body.costUsd,
    note: body.note || "manual ingest",
  });

  return NextResponse.json({ ok: true, usage });
}
