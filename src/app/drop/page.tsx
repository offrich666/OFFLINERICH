import Link from "next/link";
import { CrossmintCheckout } from "@/components/CrossmintCheckout";
import {
  getCheckoutPrice,
  getClientApiKey,
  getCollectionId,
} from "@/lib/crossmint";

export default function DropPage() {
  const apiKey = getClientApiKey();
  const collectionId = getCollectionId();
  const price = getCheckoutPrice();

  return (
    <main className="page checkout-page">
      <header className="topbar">
        <Link href="/" className="brand-mark">
          OFFLINERICH
        </Link>
        <Link href="/checkout" className="ghost-link">
          Onramp
        </Link>
      </header>

      <section className="checkout-layout">
        <div className="checkout-copy">
          <p className="eyebrow">NFT drop</p>
          <h1>Claim the drop</h1>
          <p>
            Optional collection checkout. Primary payments flow is USDC onramp
            at <Link href="/checkout">/checkout</Link>.
          </p>
          <dl className="meta-list">
            <div>
              <dt>Price</dt>
              <dd>${price} USD</dd>
            </div>
            <div>
              <dt>Network</dt>
              <dd>Polygon</dd>
            </div>
          </dl>
        </div>

        <div className="checkout-panel">
          <CrossmintCheckout
            apiKey={apiKey}
            collectionId={collectionId}
            price={price}
          />
        </div>
      </section>
    </main>
  );
}
