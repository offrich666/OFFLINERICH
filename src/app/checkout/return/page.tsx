import Link from "next/link";
import { connection } from "next/server";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(
  value: string | string[] | undefined,
): string | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

/**
 * Return landing after Transak (instant crypto) or legacy Stripe Checkout.
 * Transak may not pass session_id — still show a clear confirmation.
 */
export default async function CheckoutReturnPage({ searchParams }: Props) {
  await connection();
  const params = await searchParams;
  const sessionId = first(params.session_id);
  const orderId =
    first(params.orderId) ||
    first(params.order_id) ||
    first(params.status) ||
    null;

  let title = "Payment received";
  let body =
    "Thanks. If you paid with card / Apple Pay / Google Pay, crypto is on the way to your wallet.";

  if (sessionId) {
    try {
      const { getStripe } = await import("@/lib/stripe");
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.status === "open") {
        title = "Payment still open";
        body = "Finish checkout, then you’ll return here.";
      } else {
        const paid =
          session.payment_status === "paid" ||
          session.payment_status === "no_payment_required";
        title = paid ? "Payment received" : "Payment status";
        const wallet = session.metadata?.client_wallet;
        const network = session.metadata?.client_network;
        body = paid
          ? wallet
            ? `Thanks. Crypto goes to ${wallet}${network ? ` on ${network}` : ""} after it clears.`
            : "Thanks. Crypto will be delivered to the wallet from your order."
          : `Status: ${session.status} / ${session.payment_status}.`;
      }
    } catch {
      // keep default thank-you
    }
  } else if (orderId) {
    title = "Order submitted";
    body =
      "Your instant crypto order was submitted. Funds usually arrive in your wallet after the provider confirms payment.";
  }

  return (
    <main className="page checkout-page">
      <header className="topbar">
        <Link href="/" className="brand-mark">
          OFFLINERICH
        </Link>
        <Link href="/checkout" className="ghost-link">
          Buy again
        </Link>
      </header>

      <section className="checkout-layout checkout-layout-simple">
        <div className="checkout-copy checkout-copy-simple">
          <p className="eyebrow">Done</p>
          <h1>{title}</h1>
          <p>{body}</p>
          <div className="cta-row" style={{ marginTop: "1.5rem" }}>
            <Link href="/" className="primary-cta">
              Back home
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
