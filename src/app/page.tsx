import Link from "next/link";

export default function Home() {
  return (
    <main className="page home-page">
      <div className="atmosphere" aria-hidden />
      <div className="grain" aria-hidden />
      <div className="grid-glow" aria-hidden />

      <header className="topbar">
        <span className="brand-mark">GN Labs Crypto</span>
        <div className="topbar-actions">
          <Link href="/ramp?mode=sell" className="ghost-link">
            Sell
          </Link>
          <Link href="/ramp?mode=buy" className="top-cta">
            Buy crypto
          </Link>
        </div>
      </header>

      <section className="hero">
        <p className="brand-kicker">GN Labs</p>
        <h1 className="brand-hero">GN Labs Crypto</h1>
        <p className="lede">
          MoonPay ramps — buy crypto with card, or sell to cash out.
        </p>
        <div className="cta-row">
          <Link href="/ramp?mode=buy" className="primary-cta">
            Buy
          </Link>
          <Link href="/ramp?mode=sell" className="secondary-cta">
            Sell
          </Link>
        </div>
      </section>
    </main>
  );
}
