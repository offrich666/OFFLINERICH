import Link from "next/link";

export default function Home() {
  return (
    <main className="page home-page">
      <div className="atmosphere" aria-hidden />
      <div className="grain" aria-hidden />

      <header className="topbar">
        <span className="brand-mark">OFFLINERICH</span>
        <Link href="/checkout" className="top-cta">
          Buy
        </Link>
      </header>

      <section className="hero">
        <h1 className="brand-hero">OFFLINERICH</h1>
        <p className="lede">
          Limited digital drops. Card or crypto. Settled through Crossmint.
        </p>
        <div className="cta-row">
          <Link href="/checkout" className="primary-cta">
            Enter checkout
          </Link>
          <a
            className="secondary-cta"
            href="https://www.crossmint.com/console"
            target="_blank"
            rel="noreferrer"
          >
            Crossmint console
          </a>
        </div>
      </section>
    </main>
  );
}
