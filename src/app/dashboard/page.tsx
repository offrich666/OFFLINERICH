import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { LogoutButton } from "@/components/LogoutButton";
import { getSessionUser, publicUser } from "@/lib/auth";
import {
  REACTIVATION,
  formatAccountSize,
  formatUsd,
  programLabel,
  type ChallengeProgram,
} from "@/lib/challenges";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const view = publicUser(user);

  const equity = view.accounts.reduce((sum, a) => sum + a.balance, 0);
  const activeCount = view.accounts.filter(
    (a) => a.status === "active" || a.status === "funded",
  ).length;
  const pendingProfit = view.accounts.find(
    (a) => a.id === "acc_10k_profit_pending",
  );
  const firstName = view.name.split(/\s+/)[0] || view.name;

  return (
    <main className="fxl-page">
      <div className="fxl-atmosphere" aria-hidden />
      <div className="fxl-grid" aria-hidden />
      <SiteHeader signedIn />
      <div className="fxl-shell">
        <div className="fxl-panel">
          <div className="fxl-account-head">
            <div>
              <h1>Welcome, {firstName}</h1>
              <p className="fxl-muted" style={{ margin: 0 }}>
                {view.email} · Client portal
              </p>
            </div>
            <LogoutButton />
          </div>

          <div className="fxl-metrics" style={{ marginTop: "1.25rem" }}>
            <div className="fxl-metric">
              <span>Portfolio equity</span>
              <strong>{formatUsd(equity)}</strong>
            </div>
            <div className="fxl-metric">
              <span>Live accounts</span>
              <strong>{activeCount}</strong>
            </div>
            <div className="fxl-metric">
              <span>Orders</span>
              <strong>{view.purchases.length}</strong>
            </div>
          </div>
        </div>

        {view.reactivationRequired && pendingProfit ? (
          <div className="fxl-panel fxl-reactivation">
            <h2>Legacy profit ready to unlock</h2>
            <p className="fxl-muted">
              Your old-server <strong>10K</strong> account shows{" "}
              <strong>+{formatUsd(REACTIVATION.unlocksProfitUsd)}</strong> profit,
              but it is locked until you activate a new Instant package from our
              current plans. Minimum Instant size:{" "}
              {formatAccountSize(REACTIVATION.size)} for{" "}
              {formatUsd(REACTIVATION.price)}.
            </p>
            <div className="fxl-cta-row">
              <Link
                href="/challenges?program=instant&reactivate=1"
                className="fxl-btn fxl-btn-warn"
              >
                Buy Instant 5K · {formatUsd(REACTIVATION.price)}
              </Link>
            </div>
          </div>
        ) : null}

        <div className="fxl-panel">
          <div className="fxl-account-head">
            <h2>Trading accounts</h2>
            {view.accounts.length > 0 ? (
              <Link href="/challenges" className="fxl-btn fxl-btn-ghost">
                Add account
              </Link>
            ) : null}
          </div>

          {view.accounts.length === 0 ? (
            <div className="fxl-account" style={{ marginTop: "0.85rem" }}>
              <strong>No trading accounts yet</strong>
              <p className="fxl-muted" style={{ margin: 0 }}>
                Purchase Instant, One-Step, or Two-Step to activate your first
                Funded XL account. Sizes from $5K to $1M.
              </p>
              <div className="fxl-cta-row" style={{ marginTop: "0.75rem" }}>
                <Link href="/challenges" className="fxl-btn">
                  Browse challenges
                </Link>
              </div>
            </div>
          ) : (
            <div className="fxl-account-grid" style={{ marginTop: "0.85rem" }}>
              {view.accounts.map((account) => (
                <div key={account.id} className="fxl-account">
                  <div className="fxl-account-head">
                    <strong>{account.label}</strong>
                    <span className={`fxl-status ${account.status}`}>
                      {account.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  <div className="fxl-muted">
                    {formatAccountSize(account.size)} ·{" "}
                    {programLabel(account.program as ChallengeProgram) ||
                      account.program}{" "}
                    · Server {account.server}
                  </div>
                  <div>
                    Balance {formatUsd(account.balance)} · P/L{" "}
                    <span
                      style={{
                        color:
                          account.profit >= 0 ? "var(--signal)" : "var(--danger)",
                      }}
                    >
                      {account.profit >= 0 ? "+" : ""}
                      {formatUsd(account.profit)}
                    </span>
                  </div>
                  {account.note ? (
                    <p
                      className="fxl-muted"
                      style={{ margin: 0, fontSize: "0.9rem" }}
                    >
                      {account.note}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="fxl-panel">
          <div className="fxl-account-head">
            <h2>Orders</h2>
            <Link href="/challenges" className="fxl-btn">
              New challenge
            </Link>
          </div>
          {view.purchases.length === 0 ? (
            <p className="fxl-muted" style={{ marginTop: "0.65rem" }}>
              No orders yet. When you buy a challenge, it appears here with
              payment status.
            </p>
          ) : (
            <div className="fxl-account-grid" style={{ marginTop: "0.85rem" }}>
              {view.purchases.map((p) => (
                <div key={p.id} className="fxl-account">
                  <div className="fxl-account-head">
                    <strong>
                      {programLabel(p.program as ChallengeProgram)}{" "}
                      {formatAccountSize(p.size)}
                    </strong>
                    <span
                      className={`fxl-status ${
                        p.status === "paid" ? "funded" : "pending_activation"
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>
                  <div className="fxl-muted">
                    {formatUsd(p.amountUsd)} · {p.method}
                    {p.network ? ` · ${p.network}` : ""} ·{" "}
                    {new Date(p.createdAt).toLocaleString("en-GB", {
                      timeZone: "Europe/Warsaw",
                    })}{" "}
                    (Europe/Warsaw)
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
