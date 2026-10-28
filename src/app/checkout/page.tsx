import Link from "next/link";
import { OnrampCheckout } from "@/components/OnrampCheckout";
import {
  getClientApiKey,
  getDefaultOnrampAmount,
  getDefaultOnrampChain,
  getUsdcEnvironment,
} from "@/lib/crossmint";

export default function CheckoutPage() {
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
        <Link href="/" className="ghost-link">
          Back
        </Link>
      </header>

      <section className="checkout-layout">
        <div className="checkout-copy">
          <p className="eyebrow">Onramp checkout</p>
          <h1>Buy USDC</h1>
          <p>
            Pay with card, Apple Pay, or Google Pay. Crossmint handles KYC,
            chargebacks, and delivery into your wallet.
          </p>
          <dl className="meta-list">
            <div>
              <dt>Starting amount</dt>
              <dd>${amount}</dd>
            </div>
            <div>
              <dt>Default chain</dt>
              <dd>{chain}</dd>
            </div>
            <div>
              <dt>Environment</dt>
              <dd>{environment}</dd>
            </div>
            <div>
              <dt>Wallets</dt>
              <dd>Apple / Google / Card</dd>
            </div>
          </dl>
          <p className="fineprint">
            Apple Pay appears in Safari after you host the domain association
            file and verify the domain in Crossmint Console. Production onramp
            needs Crossmint Sales enablement.
          </p>
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
