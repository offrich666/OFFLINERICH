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
          Pay with card, Apple Pay, or Google Pay — crypto settles into the
          OFFLINERICH treasury via Stripe Onramp.
        </p>
        <div className="cta-row">
          <Link href="/checkout" className="primary-cta">
            Pay → crypto
          </Link>
          <Link href="/checkout/fiat" className="secondary-cta">
            Fiat checkout
          </Link>
        </div>
      </section>
    </main>
  );
}
