"use client";

import { useEffect, useState, useTransition } from "react";

type UsageEvent = {
  id: string;
  at: string;
  source: string;
  model?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd?: number;
  note?: string;
};

type UsageState = {
  totalTokens: number;
  totalCostUsd: number;
  alertThresholdTokens: number;
  alertFiredAt: string | null;
  webhookUrl: string | null;
  events: UsageEvent[];
  updatedAt: string;
};

type Probe = {
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
    totalTokens: number;
    costUsd?: number;
    model?: string;
  };
  error?: string;
};

type ModelRate = {
  id: string;
  usdPerToken: number;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
};

type CostSummary = {
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

type TelegramLink = {
  chatId: string | null;
  chatTitle: string | null;
  username: string | null;
  linkedAt: string | null;
  lastError: string | null;
};

type ProxyHit = {
  id: string;
  at: string;
  method: string;
  path: string;
  status: number;
  authOk: boolean;
  model?: string;
  note?: string;
};

type Props = {
  opsKey: string;
  initialUsage: UsageState;
  initialProbe: Probe | null;
  initialCost: CostSummary;
  initialRates: ModelRate[];
  initialTelegram: {
    configured: boolean;
    botUsername: string;
    botUrl: string;
    link: TelegramLink;
  };
  proxyPath: string;
  liveBaseUrl: string;
};

function formatTokens(n: number) {
  return n.toLocaleString("en-US");
}

function formatUsd(n: number, digits = 2) {
  if (!Number.isFinite(n)) return "$0";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function XaiUsageDashboard({
  opsKey,
  initialUsage,
  initialProbe,
  initialCost,
  initialRates,
  initialTelegram,
  proxyPath,
  liveBaseUrl,
}: Props) {
  const [usage, setUsage] = useState(initialUsage);
  const [probe, setProbe] = useState(initialProbe);
  const [cost, setCost] = useState(initialCost);
  const [rates, setRates] = useState(initialRates);
  const [telegram, setTelegram] = useState(initialTelegram);
  const [thresholdInput, setThresholdInput] = useState(
    String(initialUsage.alertThresholdTokens),
  );
  const [webhookInput, setWebhookInput] = useState(
    initialUsage.webhookUrl || "",
  );
  const [manualTokens, setManualTokens] = useState("1000");
  const [message, setMessage] = useState<string | null>(null);
  const [canNotify, setCanNotify] = useState(false);
  const [liveStatus, setLiveStatus] = useState<"connecting" | "live" | "offline">(
    "connecting",
  );
  const [proxyHits, setProxyHits] = useState<ProxyHit[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setCanNotify(typeof window !== "undefined" && "Notification" in window);
  }, []);

  useEffect(() => {
    const es = new EventSource(
      `/api/xai/usage/stream?key=${encodeURIComponent(opsKey)}`,
    );
    setLiveStatus("connecting");
    es.addEventListener("usage", (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data) as {
          usage: UsageState;
          cost: CostSummary;
          rates: ModelRate[];
          proxyHits?: ProxyHit[];
        };
        setUsage(data.usage);
        setCost(data.cost);
        if (data.rates?.length) setRates(data.rates);
        if (data.proxyHits) setProxyHits(data.proxyHits);
        setThresholdInput(String(data.usage.alertThresholdTokens));
        setWebhookInput(data.usage.webhookUrl || "");
        setLiveStatus("live");
      } catch {
        // ignore bad frames
      }
    });
    es.onerror = () => setLiveStatus("offline");
    es.onopen = () => setLiveStatus("live");
    return () => es.close();
  }, [opsKey]);

  const percent = Math.min(
    100,
    Math.round(
      (usage.totalTokens / Math.max(1, usage.alertThresholdTokens)) * 100,
    ),
  );
  const alertActive = usage.totalTokens >= usage.alertThresholdTokens;
  const usdPerToken = cost.usdPerToken ?? rates[0]?.usdPerToken ?? 1;
  const featuredRates = (cost.byModel.length
    ? cost.byModel
    : rates.slice(0, 6).map((r) => ({
        model: r.id,
        tokens: 0,
        costUsd: 0,
        usdPerToken: r.usdPerToken,
        inputUsdPerMillion: r.inputUsdPerMillion,
        outputUsdPerMillion: r.outputUsdPerMillion,
      }))
  ).slice(0, 8);

  async function refresh(withProbe = true) {
    const res = await fetch(
      `/api/xai/usage?key=${encodeURIComponent(opsKey)}${withProbe ? "&probe=1" : ""}`,
      { cache: "no-store" },
    );
    if (!res.ok) throw new Error("refresh failed");
    const data = (await res.json()) as {
      usage: UsageState;
      probe: Probe | null;
      cost: CostSummary;
      rates: ModelRate[];
      proxyHits?: ProxyHit[];
    };
    setUsage(data.usage);
    setCost(data.cost);
    if (data.rates?.length) setRates(data.rates);
    if (data.proxyHits) setProxyHits(data.proxyHits);
    if (data.probe) setProbe(data.probe);
    setThresholdInput(String(data.usage.alertThresholdTokens));
    setWebhookInput(data.usage.webhookUrl || "");
  }

  useEffect(() => {
    if (!alertActive || !canNotify) return;
    if (Notification.permission !== "granted") return;
    new Notification("xAI token alert", {
      body: `${formatTokens(usage.totalTokens)} tokens · ${formatUsd(cost.totalCostUsd)} (limit ${formatTokens(usage.alertThresholdTokens)})`,
    });
  }, [
    alertActive,
    canNotify,
    usage.totalTokens,
    usage.alertThresholdTokens,
    cost.totalCostUsd,
  ]);

  function run(action: () => Promise<void>) {
    setMessage(null);
    startTransition(() => {
      void action()
        .then(() => setMessage("Saved"))
        .catch((err) =>
          setMessage(err instanceof Error ? err.message : "Request failed"),
        );
    });
  }

  return (
    <div className="xai-dash">
      <p className={`xai-live-pill xai-live-${liveStatus}`}>
        {liveStatus === "live"
          ? "● Live updates on"
          : liveStatus === "connecting"
            ? "○ Connecting live feed…"
            : "○ Live feed offline — click Refresh"}
      </p>

      {alertActive ? (
        <div className="xai-alert" role="alert">
          Alert: {formatTokens(usage.totalTokens)} tokens /{" "}
          {formatUsd(cost.totalCostUsd)} — threshold{" "}
          {formatTokens(usage.alertThresholdTokens)} reached
          {usage.alertFiredAt ? (
            <span className="fineprint">
              {" "}
              · fired{" "}
              {new Date(usage.alertFiredAt).toLocaleString("en-GB", {
                timeZone: "Europe/Warsaw",
              })}{" "}
              (Europe/Warsaw)
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="xai-grid">
        <section className="setup-panel soft">
          <h2>Cost</h2>
          <p className="xai-metric">{formatUsd(cost.totalCostUsd)}</p>
          <p className="fineprint">
            Price rule: <strong>{formatUsd(usdPerToken)} per token</strong>
            {" · "}
            {formatTokens(usage.totalTokens)} × {formatUsd(usdPerToken)} ={" "}
            {formatUsd(cost.totalCostUsd)}
          </p>
          <dl className="xai-cost-breakdown">
            <div>
              <dt>Input tokens</dt>
              <dd>{formatTokens(cost.promptTokens)}</dd>
            </div>
            <div>
              <dt>Output tokens</dt>
              <dd>{formatTokens(cost.completionTokens)}</dd>
            </div>
            <div>
              <dt>Other (reasoning)</dt>
              <dd>{formatTokens(cost.otherTokens)}</dd>
            </div>
          </dl>
        </section>

        <section className="setup-panel soft">
          <h2>Tokens</h2>
          <p className="xai-metric">{formatTokens(usage.totalTokens)}</p>
          <p className="fineprint">
            of {formatTokens(usage.alertThresholdTokens)} token alert
          </p>
          <div className="xai-bar" aria-label="Token progress">
            <span style={{ width: `${percent}%` }} />
          </div>
          <p className="fineprint">{percent}% of alert threshold</p>
        </section>

        <section className="setup-panel soft">
          <h2>Key status</h2>
          {probe ? (
            <>
              <p>
                <code>{probe.redactedKey || "xai-…"}</code>
                {probe.keyName ? ` · ${probe.keyName}` : ""}
              </p>
              <p className="fineprint">
                {probe.ok ? "Live probe OK" : `Probe failed: ${probe.error}`}
                {probe.keyBlocked || probe.teamBlocked ? " · BLOCKED" : ""}
              </p>
              {probe.rateLimit?.remainingTokens != null ? (
                <p className="fineprint">
                  Rate window:{" "}
                  {formatTokens(probe.rateLimit.remainingTokens)} /{" "}
                  {formatTokens(probe.rateLimit.limitTokens || 0)} tokens left
                </p>
              ) : null}
            </>
          ) : (
            <p className="fineprint">Set XAI_API_KEY to enable live probes.</p>
          )}
          <div className="xai-actions">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const res = await fetch("/api/xai/usage", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      key: opsKey,
                      action: "probe",
                      recordSample: true,
                    }),
                  });
                  const data = (await res.json()) as {
                    probe: Probe;
                    usage: UsageState;
                    error?: string;
                  };
                  if (!res.ok) throw new Error(data.error || "probe failed");
                  setProbe(data.probe);
                  setUsage(data.usage);
                  await refresh(false);
                })
              }
            >
              Probe + record sample
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  await refresh(true);
                })
              }
            >
              Refresh
            </button>
            {canNotify ? (
              <button
                type="button"
                onClick={() => void Notification.requestPermission()}
              >
                Enable browser alerts
              </button>
            ) : null}
          </div>
        </section>
      </div>

      <section className="setup-panel soft">
        <h2>Price per token</h2>
        <p className="fineprint">
          Flat dashboard pricing: <strong>1 token = {formatUsd(usdPerToken)}</strong>.
          Every model uses the same rate.
        </p>
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>$ / token</th>
                <th>Tracked tokens</th>
                <th>Tracked cost</th>
              </tr>
            </thead>
            <tbody>
              {featuredRates.map((row) => (
                <tr key={row.model}>
                  <td>
                    <code>{row.model}</code>
                  </td>
                  <td>{formatUsd(row.usdPerToken ?? usdPerToken)}</td>
                  <td>{formatTokens(row.tokens)}</td>
                  <td>{formatUsd(row.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="setup-panel soft">
        <h2>Alert settings</h2>
        <p className="fineprint">
          Default threshold is <strong>300,000 tokens</strong> ($300,000 at
          $1/token). Telegram bot{" "}
          <a href={telegram.botUrl} target="_blank" rel="noreferrer">
            @{telegram.botUsername}
          </a>{" "}
          gets a message when the limit is hit.
        </p>
        <div className="xai-form-row">
          <label>
            Threshold (tokens)
            <input
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
              inputMode="numeric"
            />
          </label>
          <label>
            Webhook URL (optional)
            <input
              value={webhookInput}
              onChange={(e) => setWebhookInput(e.target.value)}
              placeholder="https://hooks.slack.com/… or Discord webhook"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const res = await fetch("/api/xai/usage", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    key: opsKey,
                    action: "settings",
                    alertThresholdTokens: Number(thresholdInput),
                    webhookUrl: webhookInput.trim() || null,
                  }),
                });
                const data = (await res.json()) as {
                  usage: UsageState;
                  error?: string;
                };
                if (!res.ok) throw new Error(data.error || "save failed");
                setUsage(data.usage);
              })
            }
          >
            Save alerts
          </button>
        </div>

        <div className="xai-telegram">
          <p className="fineprint">
            {telegram.configured
              ? telegram.link.chatId
                ? `Telegram linked: chat ${telegram.link.chatId}${
                    telegram.link.username ? ` (@${telegram.link.username})` : ""
                  }`
                : "Telegram bot token is set, but no chat is linked yet."
              : "Set TELEGRAM_BOT_TOKEN in env."}
          </p>
          {telegram.link.lastError ? (
            <p className="fineprint">{telegram.link.lastError}</p>
          ) : null}
          <div className="xai-actions">
            <a
              className="xai-link-btn"
              href={telegram.botUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open @{telegram.botUsername}
            </a>
            <button
              type="button"
              disabled={pending || !telegram.configured}
              onClick={() =>
                run(async () => {
                  const res = await fetch("/api/xai/telegram", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ key: opsKey, action: "link" }),
                  });
                  const data = (await res.json()) as {
                    ok: boolean;
                    link: TelegramLink;
                    hint?: string;
                    error?: string;
                  };
                  if (!res.ok) throw new Error(data.error || "link failed");
                  setTelegram((prev) => ({ ...prev, link: data.link }));
                  setMessage(data.hint || (data.ok ? "Linked" : "Not linked yet"));
                })
              }
            >
              Link Telegram
            </button>
            <button
              type="button"
              disabled={pending || !telegram.configured}
              onClick={() =>
                run(async () => {
                  const res = await fetch("/api/xai/telegram", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ key: opsKey, action: "test" }),
                  });
                  const data = (await res.json()) as {
                    ok: boolean;
                    link: TelegramLink;
                    result?: { error?: string };
                    error?: string;
                  };
                  if (!res.ok || !data.ok) {
                    setTelegram((prev) => ({
                      ...prev,
                      link: data.link || prev.link,
                    }));
                    throw new Error(
                      data.result?.error || data.error || "test alert failed",
                    );
                  }
                  setTelegram((prev) => ({ ...prev, link: data.link }));
                  setMessage("Test alert sent to Telegram");
                })
              }
            >
              Send test alert
            </button>
          </div>
        </div>
      </section>

      <section className="setup-panel soft">
        <h2>Live tracking (no manual add)</h2>
        <p>
          Cursor only counts spend when chat goes through this proxy. Composer /
          Claude / subscription Grok do not.
        </p>
        <ol className="xai-steps">
          <li>
            OpenAI API Key = <code>xai-monitor-demo</code> and toggle{" "}
            <strong>Use OpenAI API Key</strong> ON
          </li>
          <li>
            Override OpenAI Base URL ON — paste exactly:
          </li>
        </ol>
        <pre className="xai-code">{liveBaseUrl}</pre>
        <ol className="xai-steps" start={3}>
          <li>
            Models → <strong>Add Custom Model</strong> → name{" "}
            <code>grok-4.3</code> → enable it
          </li>
          <li>
            New chat → pick model <code>grok-4.3</code> (not Auto / Composer /
            Claude) → send any message
          </li>
        </ol>
        <p className="fineprint">
          If Cursor Hits below stays empty, Cursor is not calling this proxy.
          Proxy path: <code>{proxyPath}</code>
        </p>
      </section>

      <section className="setup-panel soft">
        <h2>Cursor Hits (live)</h2>
        <p className="fineprint">
          Every request Cursor sends to the proxy appears here — even auth
          failures. Empty = Cursor is not using the base URL yet.
        </p>
        {proxyHits.length === 0 ? (
          <div className="setup-panel">No Cursor hits yet.</div>
        ) : (
          <div className="xai-table-wrap">
            <table className="xai-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Req</th>
                  <th>Status</th>
                  <th>Model</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {proxyHits.slice(0, 12).map((h) => (
                  <tr key={h.id}>
                    <td>
                      {new Date(h.at).toLocaleTimeString("en-GB", {
                        timeZone: "Europe/Warsaw",
                      })}
                    </td>
                    <td>
                      {h.method} {h.path.replace(/^\/api\/xai\/v1/, "")}
                    </td>
                    <td>
                      {h.status}
                      {h.authOk ? "" : " · bad key"}
                    </td>
                    <td>{h.model || "—"}</td>
                    <td>{h.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="setup-panel soft">
        <h2>Reset / emergency ingest</h2>
        <div className="xai-form-row">
          <button
            type="button"
            className="xai-danger"
            disabled={pending}
            onClick={() =>
              run(async () => {
                if (!window.confirm("Reset tracked usage to zero?")) return;
                const res = await fetch("/api/xai/usage", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    key: opsKey,
                    action: "reset",
                    alertThresholdTokens: Number(thresholdInput) || 300_000,
                    webhookUrl: webhookInput.trim() || null,
                  }),
                });
                const data = (await res.json()) as {
                  usage: UsageState;
                  error?: string;
                };
                if (!res.ok) throw new Error(data.error || "reset failed");
                setUsage(data.usage);
                await refresh(false);
              })
            }
          >
            Reset counter
          </button>
          <label>
            Emergency manual tokens
            <input
              value={manualTokens}
              onChange={(e) => setManualTokens(e.target.value)}
              inputMode="numeric"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const res = await fetch("/api/xai/usage", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    key: opsKey,
                    action: "ingest",
                    totalTokens: Number(manualTokens),
                    note: "manual fallback",
                  }),
                });
                const data = (await res.json()) as {
                  usage: UsageState;
                  error?: string;
                };
                if (!res.ok) throw new Error(data.error || "ingest failed");
                setUsage(data.usage);
                await refresh(false);
              })
            }
          >
            Add (fallback)
          </button>
        </div>
        {message ? <p className="fineprint">{message}</p> : null}
      </section>

      <section className="ops-table-wrap">
        <h2>Recent events</h2>
        {usage.events.length === 0 ? (
          <div className="setup-panel">No tracked usage yet.</div>
        ) : (
          <table className="ops-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Source</th>
                <th>Model</th>
                <th>In / Out</th>
                <th>Tokens</th>
                <th>Cost</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {usage.events.map((e) => (
                <tr key={e.id}>
                  <td>
                    {new Date(e.at).toLocaleString("en-GB", {
                      timeZone: "Europe/Warsaw",
                    })}
                  </td>
                  <td>
                    <code>{e.source}</code>
                  </td>
                  <td>{e.model || "—"}</td>
                  <td>
                    {formatTokens(e.promptTokens || 0)} /{" "}
                    {formatTokens(e.completionTokens || 0)}
                  </td>
                  <td>{formatTokens(e.totalTokens)}</td>
                  <td>
                    {formatUsd(
                      e.costUsd != null
                        ? e.costUsd
                        : e.totalTokens * usdPerToken,
                    )}
                  </td>
                  <td className="ops-notes">{e.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
