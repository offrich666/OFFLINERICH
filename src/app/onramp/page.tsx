import { redirect } from "next/navigation";

/** Legacy Instant / Link URL — always use on-page Finland Crossmint checkout. */
export default function OnrampPage() {
  redirect("/checkout");
}
