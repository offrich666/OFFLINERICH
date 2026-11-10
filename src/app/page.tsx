import Link from "next/link";

export default function Home() {
  return (
    <main className="page home-page">
      <div className="atmosphere" aria-hidden />
      <div className="grain" aria-hidden />

      <header className="topbar">
        <span className="brand-mark">OFFLINERICH</span>
        <div className="topbar-actions">
          <Link href="/tokens" className="ghost-link">
            Tokens
          </Link>
          <Link href="/sniper" className="ghost-link">
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

      <section className="hero">
        <h1 className="brand-hero">OFFLINERICH</h1>
        <p className="lede">
          Pay $5–$9,000 on this page. Crypto goes to your wallet.
        </p>
        <div className="cta-row">
          <Link href="/checkout" className="primary-cta">
            Buy crypto
          </Link>
          <Link href="/auth" className="secondary-cta">
            Create account
          </Link>
        </div>
      </section>
    </main>
  );
}
