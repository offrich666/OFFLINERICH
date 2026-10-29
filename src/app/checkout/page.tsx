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

      <section className="checkout-layout checkout-layout-simple">
        <div className="checkout-copy checkout-copy-simple">
          <p className="eyebrow">Checkout</p>
          <h1>Pay {range}</h1>
          <p>
            Card pay → crypto to OFFLINERICH treasury → delivery to client
            wallet.
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
