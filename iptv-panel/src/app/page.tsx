import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export default async function HomePage() {
  const session = await getSession();
  redirect(session.isAdmin ? "/admin" : "/login");
}
