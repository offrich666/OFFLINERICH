import Link from "next/link";

export default function Home() {
  return (
    <main className="page home-page">
      <div className="atmosphere" aria-hidden />
      <div className="grain" aria-hidden />

      <header className="topbar">
        <span className="brand-mark">OFFLINERICH</span>
        <Link href="/checkout" className="top-cta">
          Buy USDC
        </Link>
      </header>

      <section className="hero">
        <h1 className="brand-hero">OFFLINERICH</h1>
        <p className="lede">
          Onramp stablecoins in-app. Card, Apple Pay, and Google Pay — powered
          by Crossmint.
        </p>
        <div className="cta-row">
          <Link href="/checkout" className="primary-cta">
            Open checkout
          </Link>
          <a
            className="secondary-cta"
            href="https://docs.crossmint.com/onramp/overview"
            target="_blank"
            rel="noreferrer"
          >
            Onramp docs
          </a>
        </div>
      </section>
    </main>
  );
}
