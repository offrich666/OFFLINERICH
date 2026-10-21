import { redirect } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session.isAdmin) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen">
      <AdminNav />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
