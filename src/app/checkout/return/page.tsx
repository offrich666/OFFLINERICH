import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getStripe } from "@/lib/stripe";

type Props = {
  searchParams: Promise<{ session_id?: string }>;
};

export default async function CheckoutReturnPage({ searchParams }: Props) {
  await connection();
  const { session_id: sessionId } = await searchParams;

  if (!sessionId) {
    redirect("/checkout");
  }

  let status = "complete";
  let paymentStatus = "paid";
  let email: string | null = null;
  let amount: string | null = null;
  let wallet: string | null = null;
  let network: string | null = null;

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.status === "open") {
      redirect("/checkout");
    }

    status = session.status || status;
    paymentStatus = session.payment_status || paymentStatus;
    email = session.customer_details?.email || session.customer_email || null;
    wallet = session.metadata?.client_wallet || null;
    network = session.metadata?.client_network || null;

    if (typeof session.amount_total === "number") {
      amount = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: (session.currency || "usd").toUpperCase(),
        maximumFractionDigits: 0,
      }).format(session.amount_total / 100);
    }
  } catch {
    // still show thank-you
  }

  const paid = paymentStatus === "paid" || paymentStatus === "no_payment_required";

  return (
    <main className="page checkout-page">
      <header className="topbar">
        <Link href="/" className="brand-mark">
          OFFLINERICH
        </Link>
        <Link href="/checkout" className="ghost-link">
          Pay again
        </Link>
      </header>

      <section className="checkout-layout checkout-layout-simple">
        <div className="checkout-copy checkout-copy-simple">
          <p className="eyebrow">Done</p>
          <h1>{paid ? "Payment received" : "Payment status"}</h1>
          <p>
            {paid
              ? wallet
                ? `Thanks. We’ll send crypto to ${wallet}${network ? ` on ${network}` : ""} after the payment clears.`
                : "Thanks. We’ll deliver crypto to the wallet from your order after the payment clears."
              : `Status: ${status} / ${paymentStatus}.`}
          </p>
          <dl className="meta-list">
            {amount ? (
              <div>
                <dt>Amount</dt>
                <dd>{amount}</dd>
              </div>
            ) : null}
            {wallet ? (
              <div>
                <dt>Delivery wallet</dt>
                <dd>
                  <code className="break">{wallet}</code>
                </dd>
              </div>
            ) : null}
            {email ? (
              <div>
                <dt>Email</dt>
                <dd>{email}</dd>
              </div>
            ) : null}
          </dl>
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
