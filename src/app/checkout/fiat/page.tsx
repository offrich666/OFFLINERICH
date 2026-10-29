import { Suspense } from "react";
import Link from "next/link";
import { StripeCheckout } from "@/components/StripeCheckout";

const paymentLink =
  process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK_URL ||
  "https://buy.stripe.com/eVq8wReu5cHm8WA8crds406";

function priceLabel() {
  const cents = Number(process.env.NEXT_PUBLIC_STRIPE_PRICE_CENTS || "100");
  if (!Number.isFinite(cents) || cents < 0) return "$1.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default function FiatCheckoutPage() {
  const hasKey = Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

  return (
    <main className="page checkout-page">
      <header className="topbar">
        <Link href="/" className="brand-mark">
          OFFLINERICH
        </Link>
        <Link href="/checkout" className="ghost-link">
          Crypto treasury
        </Link>
      </header>

      <section className="checkout-layout">
        <div className="checkout-copy">
          <p className="eyebrow">Fiat checkout</p>
          <h1>Card → Stripe balance</h1>
          <p>
            Live Embedded Checkout / Payment Link. Funds settle in USD on G N
            LABS LLC. For crypto into treasury wallets, use the main{" "}
            <Link href="/checkout">Pay → crypto</Link> flow.
          </p>
          <dl className="meta-list">
            <div>
              <dt>Price</dt>
              <dd>{priceLabel()}</dd>
            </div>
            <div>
              <dt>Live link</dt>
              <dd>
                <a href={paymentLink} target="_blank" rel="noreferrer">
                  buy.stripe.com
                </a>
              </dd>
            </div>
          </dl>
        </div>

        <div className="checkout-panel">
          {hasKey ? (
            <Suspense
              fallback={<div className="setup-panel">Loading checkout…</div>}
            >
              <StripeCheckout />
            </Suspense>
          ) : (
            <div className="setup-panel">
              <h2>Live Payment Link</h2>
              <p>
                <a className="primary-cta" href={paymentLink} target="_blank" rel="noreferrer">
                  Pay {priceLabel()} live
                </a>
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
