import { Suspense } from "react";
import Link from "next/link";
import { StripeOnrampCheckout } from "@/components/StripeOnrampCheckout";
import { TREASURY } from "@/lib/treasury";

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
  if (key.includes("_test_")) return "test (swap to pk_live_)";
  return "—";
}

export default function CheckoutPage() {
  const price = priceLabel();
  const mode = modeLabel();

  return (
    <main className="page checkout-page">
      <header className="topbar">
        <Link href="/" className="brand-mark">
          OFFLINERICH
        </Link>
        <Link href="/checkout/fiat" className="ghost-link">
          Fiat only
        </Link>
      </header>

      <section className="checkout-layout">
        <div className="checkout-copy">
          <p className="eyebrow">Live checkout</p>
          <h1>Pay → we receive crypto</h1>
          <p>
            Same Crossmint-style flow on Stripe: buyer pays with card / Apple
            Pay / Google Pay, and crypto settles into the locked OFFLINERICH
            treasury wallets.
          </p>
          <dl className="meta-list">
            <div>
              <dt>Amount</dt>
              <dd>{price} USD → USDC / ETH / BTC</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>{mode}</dd>
            </div>
            <div>
              <dt>Merchant</dt>
              <dd>G N LABS LLC</dd>
            </div>
            <div>
              <dt>Treasury (EVM)</dt>
              <dd>
                <code>{TREASURY.evm}</code>
              </dd>
            </div>
            <div>
              <dt>Treasury (BTC)</dt>
              <dd>
                <code>{TREASURY.bitcoin}</code>
              </dd>
            </div>
          </dl>
          <p className="fineprint">
            Networks: Ethereum, Polygon, Base, Bitcoin. BSC is not supported by
            Stripe Onramp — use the same EVM address on Polygon/Base/ETH instead.
            Requires Stripe Crypto Onramp approval + live API keys on G N LABS
            LLC.
          </p>
        </div>

        <div className="checkout-panel">
          <Suspense
            fallback={<div className="setup-panel">Loading checkout…</div>}
          >
            <StripeOnrampCheckout />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
