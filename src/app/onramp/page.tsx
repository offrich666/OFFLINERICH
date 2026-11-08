import { redirect } from "next/navigation";

/** Legacy Instant / Link URL — always use on-page Stripe Crypto Onramp checkout. */
export default function OnrampPage() {
  redirect("/checkout");
}
