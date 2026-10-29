import { Suspense } from "react";
import Link from "next/link";
import { ClientPayCheckout } from "@/components/ClientPayCheckout";
import { checkoutAmountRangeLabel } from "@/lib/networks";

export default function CheckoutPage() {
  const range = checkoutAmountRangeLabel();

  return (
    <main className="page checkout-page">
      <header className="topbar">
        <Link href="/" className="brand-mark">
          OFFLINERICH
        </Link>
        <span className="ghost-link">{range}</span>
      </header>

      <section className="checkout-layout">
        <div className="checkout-copy">
          <p className="eyebrow">Checkout</p>
          <h1>Pay {range}</h1>
          <p>
            Card, Apple Pay, or Google Pay. Choose any amount from $10 to
            $9,000, add your wallet on the network you choose — crypto is
            delivered there after payment.
          </p>
          <dl className="meta-list">
            <div>
              <dt>Amount</dt>
              <dd>{range}</dd>
            </div>
            <div>
              <dt>Pay with</dt>
              <dd>Card · Apple Pay · Google Pay</dd>
            </div>
            <div>
              <dt>You receive</dt>
              <dd>Crypto on your wallet / network</dd>
            </div>
          </dl>
          <p className="fineprint">
            Enter your destination wallet carefully. Delivery starts after
            Stripe confirms payment.
          </p>
        </div>

        <div className="checkout-panel">
          <Suspense
            fallback={<div className="setup-panel">Loading checkout…</div>}
          >
            <ClientPayCheckout />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
