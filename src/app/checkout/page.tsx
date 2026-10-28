import Link from "next/link";
import { connection } from "next/server";
import { PaymentCheckout } from "@/components/PaymentCheckout";
import {
  crossmintFetch,
  getCheckoutPrice,
  getClientApiKey,
  getCollectionId,
  getUsdcEnvironment,
} from "@/lib/crossmint";

async function probeCheckout() {
  const collectionId = getCollectionId();
  if (!collectionId) {
    return {
      blocked: true,
      message: "Collection id is not configured.",
    };
  }

  try {
    const { ok, data } = await crossmintFetch<{
      message?: string;
      clientSecret?: string;
      order?: { orderId?: string };
    }>("/orders", {
      method: "POST",
      body: JSON.stringify({
        recipient: { email: "probe@offlinerich.local" },
        payment: {
          receiptEmail: "probe@offlinerich.local",
          method: "card",
          currency: "usd",
        },
        lineItems: [
          {
            collectionLocator: `crossmint:${collectionId}`,
            callData: { totalPrice: getCheckoutPrice(), quantity: 1 },
          },
        ],
      }),
    });

    if (ok && (data.clientSecret || data.order?.orderId)) {
      return { blocked: false, message: "Checkout order create succeeded." };
    }

    return {
      blocked: true,
      message:
        data.message ||
        "Crossmint rejected the production checkout probe.",
    };
  } catch (error) {
    return {
      blocked: true,
      message:
        error instanceof Error
          ? error.message
          : "Could not probe Crossmint checkout.",
    };
  }
}

export default async function CheckoutPage() {
  await connection();
  const apiKey = getClientApiKey();
  const collectionId = getCollectionId();
  const price = getCheckoutPrice();
  const environment = getUsdcEnvironment();
  const probe = await probeCheckout();

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
            Card, Apple Pay, and Google Pay through Crossmint Embedded Checkout.
            Crypto is available too.
          </p>
          <dl className="meta-list">
            <div>
              <dt>Price</dt>
              <dd>${price} USDC</dd>
            </div>
            <div>
              <dt>Collection</dt>
              <dd>{collectionId || "—"}</dd>
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
          <p className="fineprint">
            Collection <code>offlinerich-drop</code> and payout wallet are
            already created. Production charges unlock after Crossmint verifies
            the project (Order Form + KYB) and you start collection review in
            Console.
          </p>
        </div>

        <div className="checkout-panel">
          <PaymentCheckout
            apiKey={apiKey}
            collectionId={collectionId}
            price={price}
            verificationBlocked={probe.blocked}
            verificationMessage={probe.message}
          />
        </div>
      </section>
    </main>
  );
}
