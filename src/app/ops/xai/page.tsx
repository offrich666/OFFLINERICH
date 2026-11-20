import { connection } from "next/server";
import { XaiUsageDashboard } from "@/components/XaiUsageDashboard";
import {
  buildCostSummary,
  getXaiModelRates,
  getXaiUsage,
  probeXaiKey,
  updateXaiUsageSettings,
} from "@/lib/xaiUsage";
import { getTelegramLink, telegramBotConfigured } from "@/lib/xaiTelegram";

type Props = {
  searchParams: Promise<{ key?: string }>;
};

export default async function OpsXaiPage({ searchParams }: Props) {
  await connection();
  const { key } = await searchParams;
  const expected = process.env.OPS_SECRET || "";

  if (!expected || key !== expected) {
    return (
      <main className="page checkout-page">
        <section className="checkout-layout">
          <div className="setup-panel">
            <h2>Ops access required</h2>
            <p>
              Open <code>/ops/xai?key=YOUR_OPS_SECRET</code> after setting{" "}
              <code>OPS_SECRET</code> and <code>XAI_API_KEY</code> in env.
            </p>
          </div>
        </section>
      </main>
    );
  }

  let usageFresh = await getXaiUsage();
  // Keep runtime threshold aligned with env default (300k) when env is updated.
  const envThreshold = Number(process.env.XAI_TOKEN_ALERT_THRESHOLD || 0);
  if (
    Number.isFinite(envThreshold) &&
    envThreshold > 0 &&
    envThreshold !== usageFresh.alertThresholdTokens
  ) {
    usageFresh = await updateXaiUsageSettings({
      alertThresholdTokens: envThreshold,
    });
  }
  const rates = await getXaiModelRates();
  const cost = buildCostSummary(usageFresh, rates);
  const telegramLink = await getTelegramLink();
  const probe = process.env.XAI_API_KEY?.trim()
    ? await probeXaiKey({ recordSample: false })
    : null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const proxyPath = `${appUrl.replace(/\/$/, "")}/api/xai/proxy/chat/completions`;

  return (
    <main className="page checkout-page">
      <section className="checkout-layout" style={{ gridTemplateColumns: "1fr" }}>
        <div className="checkout-copy">
          <p className="eyebrow">Ops · xAI</p>
          <h1>Token spend monitor</h1>
          <p>
            Tracks tokens with flat pricing: <strong>$1 per token</strong>.
            Telegram alert at <strong>300,000 tokens</strong> ($300,000) via
            @botapilimit_bot.
          </p>
        </div>

        <XaiUsageDashboard
          opsKey={expected}
          initialUsage={usageFresh}
          initialProbe={probe}
          initialCost={cost}
          initialRates={rates.slice(0, 40).map((r) => ({
            id: r.id,
            usdPerToken: r.usdPerToken,
            inputUsdPerMillion: r.inputUsdPerMillion,
            outputUsdPerMillion: r.outputUsdPerMillion,
            cachedInputUsdPerMillion: r.cachedInputUsdPerMillion,
          }))}
          initialTelegram={{
            configured: telegramBotConfigured(),
            botUsername: "botapilimit_bot",
            botUrl: "https://t.me/botapilimit_bot",
            link: telegramLink,
          }}
          proxyPath={proxyPath || "/api/xai/proxy/chat/completions"}
        />
      </section>
    </main>
  );
}
