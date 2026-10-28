import { Suspense } from "react";
import Link from "next/link";
import { StripeCheckout } from "@/components/StripeCheckout";

export const instant = false;

function priceLabel() {
  const cents = Number(process.env.NEXT_PUBLIC_STRIPE_PRICE_CENTS || "100");
  if (!Number.isFinite(cents) || cents < 0) return "$1.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function modeLabel() {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
  if (key.includes("_live_")) return "live";
  if (key.includes("_test_")) return "test";
  return "—";
}

export default function CheckoutPage() {
  const price = priceLabel();
  const mode = modeLabel();
  const hasKey = Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

  return (
    <main className="page checkout-page">
      <header className="topbar">
        <Link href="/" className="brand-mark">
          OFFLINERICH
        </Link>
        <Link href="/onramp" className="ghost-link">
          Onramp
        </Link>
      </header>

      <section className="checkout-layout">
        <div className="checkout-copy">
          <p className="eyebrow">Checkout</p>
          <h1>Pay & claim</h1>
          <p>
            Card, Apple Pay, and Google Pay through Stripe Embedded Checkout.
          </p>
          <dl className="meta-list">
            <div>
              <dt>Price</dt>
              <dd>{price}</dd>
            </div>
            <div>
              <dt>Product</dt>
              <dd>OFFLINERICH Drop</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>{mode}</dd>
            </div>
            <div>
              <dt>Merchant</dt>
              <dd>G N LABS LLC</dd>
            </div>
          </dl>
          <p className="fineprint">
            Local/dev uses Stripe test keys so you can pay with{" "}
            <code>4242…</code> without real charges. Swap in live keys + the
            live price id from G N LABS LLC to take real payments.
          </p>
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
              <h2>Stripe keys required</h2>
              <p>
                Set <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code>,{" "}
                <code>STRIPE_SECRET_KEY</code>, and <code>STRIPE_PRICE_ID</code>{" "}
                in <code>.env.local</code>.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
