import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getStripe } from "@/lib/stripe";

export const instant = false;

type Props = {
  searchParams: Promise<{ session_id?: string }>;
};

export default async function CheckoutReturnPage({ searchParams }: Props) {
  await connection();
  const { session_id: sessionId } = await searchParams;

  if (!sessionId) {
    redirect("/checkout");
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.status === "open") {
    redirect("/checkout");
  }

  const email =
    session.customer_details?.email || session.customer_email || null;
  const paid =
    session.payment_status === "paid" ||
    session.payment_status === "no_payment_required";
  const amount =
    typeof session.amount_total === "number"
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: (session.currency || "usd").toUpperCase(),
        }).format(session.amount_total / 100)
      : null;

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
          <p className="eyebrow">Return</p>
          <h1>{paid ? "Payment complete" : "Payment status"}</h1>
          <p>
            {paid
              ? "Thanks — your OFFLINERICH drop payment went through."
              : `Stripe reports status “${session.status}” / payment “${session.payment_status}”.`}
          </p>
          <dl className="meta-list">
            {amount ? (
              <div>
                <dt>Amount</dt>
                <dd>{amount}</dd>
              </div>
            ) : null}
            {email ? (
              <div>
                <dt>Email</dt>
                <dd>{email}</dd>
              </div>
            ) : null}
            <div>
              <dt>Session</dt>
              <dd>
                <code>{session.id}</code>
              </dd>
            </div>
          </dl>
          <p className="fineprint">
            Fulfillment runs from the Stripe webhook (
            <code>checkout.session.completed</code>), not this page alone.
          </p>
          <div className="cta-row" style={{ marginTop: "1.5rem" }}>
            <Link href="/" className="primary-cta">
              Back home
            </Link>
            <Link href="/checkout" className="secondary-cta">
              Buy again
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
