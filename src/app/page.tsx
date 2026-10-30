import Link from "next/link";

export default function Home() {
  return (
    <main className="page home-page">
      <div className="atmosphere" aria-hidden />
      <div className="grain" aria-hidden />

      <header className="topbar">
        <span className="brand-mark">OFFLINERICH</span>
        <Link href="/checkout" className="top-cta">
          Pay
        </Link>
      </header>

      <section className="hero">
        <h1 className="brand-hero">OFFLINERICH</h1>
        <p className="lede">
          Pay $5–$9,000 with card, Apple Pay, or Google Pay. Crypto goes
          straight to your wallet.
        </p>
        <div className="cta-row">
          <Link href="/checkout" className="primary-cta">
            Pay $5–$9,000
          </Link>
        </div>
      </section>
    </main>
  );
}
