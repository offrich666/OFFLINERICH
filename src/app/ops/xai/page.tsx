import { connection } from "next/server";
import { XaiUsageDashboard } from "@/components/XaiUsageDashboard";
import {
  buildCostSummary,
  getXaiModelRates,
  getXaiUsage,
  probeXaiKey,
} from "@/lib/xaiUsage";

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

  const usage = await getXaiUsage();
  const rates = await getXaiModelRates();
  const cost = buildCostSummary(usage, rates);
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
            Tracks tokens and dollar cost from xAI per-token rates (input /
            output $/1M). Alerts when spend hits your threshold (default
            30,000 tokens).
          </p>
        </div>

        <XaiUsageDashboard
          opsKey={expected}
          initialUsage={usage}
          initialProbe={probe}
          initialCost={cost}
          initialRates={rates.slice(0, 40).map((r) => ({
            id: r.id,
            inputUsdPerMillion: r.inputUsdPerMillion,
            outputUsdPerMillion: r.outputUsdPerMillion,
            cachedInputUsdPerMillion: r.cachedInputUsdPerMillion,
          }))}
          proxyPath={proxyPath || "/api/xai/proxy/chat/completions"}
        />
      </section>
    </main>
  );
}
