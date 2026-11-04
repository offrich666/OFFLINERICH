import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { getSessionUser } from "@/lib/auth";
import {
  ACCOUNT_SIZES,
  PROGRAMS,
  RULES,
  formatAccountSize,
  formatUsd,
  getChallengePrice,
} from "@/lib/challenges";

export default async function Home() {
  const user = await getSessionUser();

  return (
    <main className="fxl-page">
      <div className="fxl-atmosphere" aria-hidden />
      <div className="fxl-grid" aria-hidden />
      <SiteHeader signedIn={Boolean(user)} />

      <section className="fxl-hero">
        <div className="fxl-hero-visual" aria-hidden />
        <p className="fxl-hero-brand">
          FUNDED <span>XL</span>
        </p>
        <h2>Institutional capital. Trader-first payouts.</h2>
        <p className="fxl-lede">
          Choose Instant, One-Step, or Two-Step. Account sizes from $5K to $1M.
          Keep up to {RULES.profitSplit} of profits with bi-weekly payouts.
        </p>
        <div className="fxl-cta-row">
          <Link href={user ? "/challenges" : "/register?next=/challenges"} className="fxl-btn">
            {user ? "Browse challenges" : "Create free account"}
          </Link>
          <Link
            href={user ? "/dashboard" : "/challenges"}
            className="fxl-btn fxl-btn-ghost"
          >
            {user ? "Open dashboard" : "View challenges"}
          </Link>
        </div>
      </section>

      <section className="fxl-section" id="programs">
        <h2>Three professional paths</h2>
        <p>Pick the evaluation style that matches how you trade.</p>
        <div className="fxl-program-grid">
          {PROGRAMS.map((p) => (
            <Link key={p.id} href={`/challenges?program=${p.id}`} className="fxl-program">
              <span className="fxl-chip">{p.phases}</span>
              <h3>{p.name}</h3>
              <p>{p.tagline}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="fxl-section" id="pricing">
        <h2>Challenge pricing</h2>
        <p>
          Instant starts at {formatUsd(getChallengePrice("instant", 5000))} for $5K.
          One-Step is 24% less. Two-Step from {formatUsd(getChallengePrice("two-step", 5000))}.
        </p>
        <div className="fxl-table-wrap">
          <table className="fxl-price-table">
            <thead>
              <tr>
                <th>Size</th>
                <th>Instant</th>
                <th>One-Step (−24%)</th>
                <th>Two-Step</th>
              </tr>
            </thead>
            <tbody>
              {ACCOUNT_SIZES.map((size) => (
                <tr key={size}>
                  <td>{formatAccountSize(size)}</td>
                  <td className="price">{formatUsd(getChallengePrice("instant", size))}</td>
                  <td className="price">{formatUsd(getChallengePrice("one-step", size))}</td>
                  <td className="price">{formatUsd(getChallengePrice("two-step", size))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="fxl-section" id="rules">
        <h2>Clear rules. Real payouts.</h2>
        <p>Trade with discipline. We fund traders who protect capital.</p>
        <div className="fxl-rules">
          <div className="fxl-rule">
            <strong>{RULES.profitSplit}</strong>
            <span>Profit split</span>
          </div>
          <div className="fxl-rule">
            <strong>{RULES.maxDailyLoss}</strong>
            <span>Max daily loss</span>
          </div>
          <div className="fxl-rule">
            <strong>{RULES.maxOverallLoss}</strong>
            <span>Max overall loss</span>
          </div>
          <div className="fxl-rule">
            <strong>{RULES.payoutCycle}</strong>
            <span>Payout cycle</span>
          </div>
        </div>
      </section>

      <footer className="fxl-footer">
        <strong>Funded XL</strong> · Card & crypto checkout · Solana, BSC, and TRON
      </footer>
    </main>
  );
}
