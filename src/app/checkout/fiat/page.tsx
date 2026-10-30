import { redirect } from "next/navigation";

/** Alias — easy card lives on main /checkout (default path). */
export default function FiatCheckoutAlias() {
  redirect("/checkout");
}
