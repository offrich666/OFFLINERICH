import { connection } from "next/server";
import { XaiUsageDashboard } from "@/components/XaiUsageDashboard";
import { getXaiUsage, probeXaiKey } from "@/lib/xaiUsage";

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
            Tracks tokens from the usage proxy (and manual entries). Alerts when
            spend hits your threshold (default 30,000). xAI does not expose
            wallet token balance on a normal API key — this counter is the
            source of truth for apps you route through the proxy.
          </p>
        </div>

        <XaiUsageDashboard
          opsKey={expected}
          initialUsage={usage}
          initialProbe={probe}
          proxyPath={proxyPath || "/api/xai/proxy/chat/completions"}
        />
      </section>
    </main>
  );
}
