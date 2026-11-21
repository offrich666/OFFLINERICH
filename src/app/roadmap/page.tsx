import Link from "next/link";
import { connection } from "next/server";
import { getPublishableKey, isLiveStripeKey } from "@/lib/stripe";

export const metadata = {
  title: "Stripe roadmap — OFFLINERICH",
  description:
    "Stripe Crypto Onramp acceptance roadmap for G N LABS LLC (ACCEPTED).",
};

/**
 * Public status page for the Stripe Crypto Onramp product we were accepted for.
 */
export default async function RoadmapPage() {
  await connection();
  const secret = process.env.STRIPE_SECRET_KEY || "";
  const publishable = getPublishableKey();
  const live = isLiveStripeKey(secret) || isLiveStripeKey(publishable);
  const keysReady = Boolean(secret && publishable);

  return (
    <main className="page checkout-page">
      <div className="atmosphere" aria-hidden />
      <div className="grain" aria-hidden />

      <header className="topbar">
        <Link href="/" className="brand-mark">
          OFFLINERICH
        </Link>
        <div className="topbar-actions">
          <Link href="/checkout" className="ghost-link">
            Checkout
          </Link>
          <Link href="/checkout" className="top-cta">
            Pay
          </Link>
        </div>
      </header>

      <section className="checkout-layout roadmap-layout">
        <div className="checkout-copy">
          <p className="eyebrow">Stripe · accepted</p>
          <h1>Crypto Onramp roadmap</h1>
          <p>
            G N LABS LLC was accepted for Stripe Crypto Onramp. This page is the
            live checklist for that product.
          </p>
        </div>

        <div className="checkout-panel setup-panel soft roadmap-panel">
          <p className="status-line" role="status">
            Application: ACCEPTED (live + test)
          </p>

          <dl className="meta-list">
            <div>
              <dt>Account</dt>
              <dd>G N LABS LLC · acct_1UCk64QWCzdANStk</dd>
            </div>
            <div>
              <dt>Product</dt>
              <dd>Stripe Crypto Onramp</dd>
            </div>
            <div>
              <dt>Keys</dt>
              <dd>
                {keysReady
                  ? live
                    ? "Live keys present"
                    : "Test keys present"
                  : "Keys missing in this environment"}
              </dd>
            </div>
            <div>
              <dt>Settle networks</dt>
              <dd>Ethereum USDC · Bitcoin</dd>
            </div>
            <div>
              <dt>Source currency</dt>
              <dd>EUR (standard settlement)</dd>
            </div>
            <div>
              <dt>Domain allowlist</dt>
              <dd>www.walletchainsign.com · localhost</dd>
            </div>
          </dl>

          <h2>Unlocked by acceptance</h2>
          <ol className="roadmap-steps">
            <li>
              Mint Onramp sessions via{" "}
              <code>POST /api/onramp/session</code> (Stripe{" "}
              <code>/v1/crypto/onramp_sessions</code>).
            </li>
            <li>
              Hosted Link Pay at <code>crypto.link.com</code> from each session{" "}
              <code>redirect_url</code>.
            </li>
            <li>
              Webhooks on <code>crypto.onramp_session.updated</code> for
              fulfillment.
            </li>
            <li>
              Card / Link capabilities active on the Stripe account for fiat
              collection.
            </li>
          </ol>

          <h2>Client path today</h2>
          <p>
            Reliable client pay uses Stripe hosted Checkout on{" "}
            <Link href="/checkout">/checkout</Link>. Crypto Onramp enrollment is
            accepted; use it when you want direct USDC/BTC settlement through
            Stripe Link.
          </p>

          <div className="cta-row roadmap-links">
            <a
              className="primary-cta"
              href="https://dashboard.stripe.com/crypto-onramp/onboarding"
              target="_blank"
              rel="noreferrer"
            >
              Stripe Onramp checklist
            </a>
            <a
              className="ghost-link"
              href="https://dashboard.stripe.com/crypto-onramp/allowlist-domains"
              target="_blank"
              rel="noreferrer"
            >
              Domain allowlist
            </a>
            <Link className="ghost-link" href="/api/onramp/status">
              Status JSON
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
