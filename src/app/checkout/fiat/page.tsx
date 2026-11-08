import { redirect } from "next/navigation";

/** Alias — card checkout lives on main /checkout (Stripe Onramp embed). */
export default function FiatCheckoutAlias() {
  redirect("/checkout");
}
