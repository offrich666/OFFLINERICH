import Link from "next/link";

export default function Home() {
  return (
    <main className="page home-page">
      <div className="atmosphere" aria-hidden />
      <div className="grain" aria-hidden />

      <header className="topbar">
        <span className="brand-mark">OFFLINERICH</span>
        <Link href="/checkout" className="top-cta">
          Checkout
        </Link>
      </header>

      <section className="hero">
        <h1 className="brand-hero">OFFLINERICH</h1>
        <p className="lede">
          Pay with card, Apple Pay, or Google Pay through Stripe Embedded
          Checkout.
        </p>
        <div className="cta-row">
          <Link href="/checkout" className="primary-cta">
            Open checkout
          </Link>
          <Link href="/onramp" className="secondary-cta">
            Buy USDC
          </Link>
        </div>
      </section>
    </main>
  );
}
