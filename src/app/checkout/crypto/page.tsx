import { redirect } from "next/navigation";

/** Alias — main checkout is already Onramp → treasury. */
export default function CryptoOnrampAliasPage() {
  redirect("/checkout");
}
