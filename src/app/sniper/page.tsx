import Link from "next/link";
import SniperPanel from "@/components/tokens/SniperPanel";

export const metadata = {
  title: "Sniper · OFFLINERICH",
  description: "Arm token snipes from your linked wallets.",
};

export default function SniperPage() {
  return (
    <main className="page tokens-page">
      <div className="atmosphere" aria-hidden />
      <div className="grain" aria-hidden />

      <header className="topbar">
        <Link href="/" className="brand-mark">
          OFFLINERICH
        </Link>
        <div className="topbar-actions">
          <Link href="/tokens" className="ghost-link">
            Tokens
          </Link>
          <Link href="/sniper" className="ghost-link" aria-current="page">
            Sniper
          </Link>
          <Link href="/auth" className="ghost-link">
            Account
          </Link>
          <Link href="/checkout" className="top-cta">
            Pay
          </Link>
        </div>
      </header>

      <section className="tokens-hero">
        <p className="tokens-kicker">Sniper</p>
        <h1 className="tokens-title">Watch & strike</h1>
        <p className="tokens-lede">
          Pick a linked wallet, arm a token watch, and approve the buy in your
          wallet when liquidity is live.
        </p>
      </section>

      <SniperPanel />
    </main>
  );
}
