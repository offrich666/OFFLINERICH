import { Suspense } from "react";
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

export const instant = false;

async function probeCheckout() {
  await connection();
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

async function CheckoutPanel() {
  const apiKey = getClientApiKey();
  const collectionId = getCollectionId();
  const price = getCheckoutPrice();
  const probe = await probeCheckout();

  return (
    <PaymentCheckout
      apiKey={apiKey}
      collectionId={collectionId}
      price={price}
      verificationBlocked={probe.blocked}
      verificationMessage={probe.message}
    />
  );
}

export default function CheckoutPage() {
  const collectionId = getCollectionId();
  const price = getCheckoutPrice();
  const environment = getUsdcEnvironment();

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
              <dt>Payout owner</dt>
              <dd>naserademid@gmail.com</dd>
            </div>
          </dl>
          <p className="fineprint">
            Collection <code>offlinerich-drop</code> pays out to the Crossmint
            wallet owned by <code>naserademid@gmail.com</code>. Verification
            contact: <code>groupgrow64@gmail.com</code>. Production charges
            unlock after Crossmint KYB + collection review (Support ticket
            already filed).
          </p>
        </div>

        <div className="checkout-panel">
          <Suspense
            fallback={<div className="setup-panel">Loading checkout…</div>}
          >
            <CheckoutPanel />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
