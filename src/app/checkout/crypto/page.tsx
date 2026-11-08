import { redirect } from "next/navigation";

/** Alias — main checkout is Stripe Crypto Onramp → client wallet. */
export default function CryptoOnrampAliasPage() {
  redirect("/checkout");
}
