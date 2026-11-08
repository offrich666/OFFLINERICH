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
        <span className="ghost-link">{range} · Finland</span>
      </header>

      <section className="checkout-layout checkout-layout-simple">
        <div className="checkout-copy checkout-copy-simple">
          <p className="eyebrow">Finland</p>
          <h1>Card checkout {range}</h1>
          <p>
            Available in Finland. Pay with a Finnish card — crypto is delivered
            to your wallet.
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
