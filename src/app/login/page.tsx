import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { LoginForm } from "@/components/LoginForm";
import { getSessionUser } from "@/lib/auth";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  return (
    <main className="fxl-page">
      <div className="fxl-atmosphere" aria-hidden />
      <div className="fxl-grid" aria-hidden />
      <SiteHeader />
      <div className="fxl-shell" style={{ maxWidth: 480 }}>
        <div className="fxl-panel">
          <h1>Client login</h1>
          <p className="fxl-muted">
            Access your Funded XL dashboard, accounts, and payout status.
          </p>
          <LoginForm />
          <p className="fxl-muted" style={{ marginTop: "1rem", fontSize: "0.88rem" }}>
            New trader?{" "}
            <Link href="/challenges" style={{ color: "var(--signal)" }}>
              Buy a challenge
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
