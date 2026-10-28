import Link from "next/link";
import { OnrampCheckout } from "@/components/OnrampCheckout";
import {
  getClientApiKey,
  getDefaultOnrampAmount,
  getDefaultOnrampChain,
  getUsdcEnvironment,
} from "@/lib/crossmint";

export const instant = false;

export default function OnrampPage() {
  const amount = getDefaultOnrampAmount();
  const chain = getDefaultOnrampChain();
  const environment = getUsdcEnvironment();
  const apiKey = getClientApiKey();

  return (
    <main className="page checkout-page">
      <header className="topbar">
        <Link href="/" className="brand-mark">
          OFFLINERICH
        </Link>
        <Link href="/checkout" className="ghost-link">
          Checkout
        </Link>
      </header>

      <section className="checkout-layout">
        <div className="checkout-copy">
          <p className="eyebrow">USDC onramp</p>
          <h1>Buy USDC</h1>
          <p>
            Separate onramp flow. Production onramp also requires Crossmint
            Sales (Order Form + KYB).
          </p>
          <dl className="meta-list">
            <div>
              <dt>Default amount</dt>
              <dd>${amount}</dd>
            </div>
            <div>
              <dt>Chain</dt>
              <dd>{chain}</dd>
            </div>
            <div>
              <dt>Environment</dt>
              <dd>{environment}</dd>
            </div>
            <div>
              <dt>Methods</dt>
              <dd>Card / Apple / Google</dd>
            </div>
          </dl>
        </div>

        <div className="checkout-panel">
          <OnrampCheckout
            apiKey={apiKey}
            defaultAmount={amount}
            defaultChain={chain}
          />
        </div>
      </section>
    </main>
  );
}
