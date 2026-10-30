import { redirect } from "next/navigation";

/** Fiat-only path retired — product is Onramp → internal settle → client. */
export default function FiatCheckoutRetired() {
  redirect("/checkout");
}
