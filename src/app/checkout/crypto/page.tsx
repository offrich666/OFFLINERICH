import { Suspense } from "react";
import Link from "next/link";
import { StripeTreasuryOnramp } from "@/components/StripeTreasuryOnramp";
import { checkoutAmountRangeLabel } from "@/lib/networks";

/**
 * Optional path: Stripe Crypto Onramp → USDC to treasury.
 * Many bank cards block this MCC — prefer main /checkout for those.
 */
export default function CryptoOnrampPage() {
  const range = checkoutAmountRangeLabel();

  return (
    <main className="page checkout-page">
      <header className="topbar">
        <Link href="/" className="brand-mark">
          OFFLINERICH
        </Link>
        <Link href="/checkout" className="ghost-link">
          Bank card pay
        </Link>
      </header>

      <section className="checkout-layout checkout-layout-simple">
        <div className="checkout-copy checkout-copy-simple">
          <p className="eyebrow">Crypto Onramp</p>
          <h1>Pay {range} → USDC treasury</h1>
          <p>
            Direct crypto settle. If your bank says “not allowed merchant
            category,” use{" "}
            <Link href="/checkout">normal card checkout</Link> instead.
          </p>
        </div>

        <div className="checkout-panel">
          <Suspense
            fallback={<div className="setup-panel">Loading onramp…</div>}
          >
            <StripeTreasuryOnramp />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
