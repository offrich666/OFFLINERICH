import { redirect } from "next/navigation";

/** Legacy checkout — Funded XL clients use /challenges (no processor branding). */
export default function CheckoutPage() {
  redirect("/challenges");
}
