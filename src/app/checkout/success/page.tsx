import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { getSessionUser } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { markPurchasePaid } from "@/lib/users";

type Props = {
  searchParams: Promise<{ session_id?: string }>;
};

export default async function CheckoutSuccessPage({ searchParams }: Props) {
  const sp = await searchParams;
  const user = await getSessionUser();
  const sessionId = sp.session_id;
  let activated = false;
  let error = "";

  if (sessionId && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status === "paid") {
        await markPurchasePaid({
          stripeSessionId: session.id,
          userId: session.metadata?.user_id,
        });
        activated = true;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not verify payment";
    }
  }

  return (
    <main className="fxl-page">
      <div className="fxl-atmosphere" aria-hidden />
      <SiteHeader signedIn={Boolean(user)} />
      <div className="fxl-shell" style={{ maxWidth: 560 }}>
        <div className="fxl-panel">
          <h1>{activated ? "Payment confirmed" : "Checkout received"}</h1>
          <p className="fxl-muted">
            {activated
              ? "Your Funded XL account is activating. Open the dashboard to see the new account and any unlocked legacy profit."
              : "If your card payment cleared, your dashboard will update shortly after Stripe confirms."}
          </p>
          {error ? <p className="fxl-error">{error}</p> : null}
          <div className="fxl-cta-row">
            <Link href="/dashboard" className="fxl-btn">
              Go to dashboard
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
