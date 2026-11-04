import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { LoginForm } from "@/components/LoginForm";
import { getSessionUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/safeNext";

type Props = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  const sp = await searchParams;
  const nextPath = safeNextPath(sp.next, "/dashboard");

  return (
    <main className="fxl-page">
      <div className="fxl-atmosphere" aria-hidden />
      <div className="fxl-grid" aria-hidden />
      <SiteHeader />
      <div className="fxl-shell" style={{ maxWidth: 480 }}>
        <div className="fxl-panel">
          <h1>Client login</h1>
          <p className="fxl-muted">
            Access your Funded XL dashboard, trading accounts, and payouts.
          </p>
          <LoginForm nextPath={nextPath} />
          <p className="fxl-muted" style={{ marginTop: "1rem", fontSize: "0.88rem" }}>
            New trader?{" "}
            <Link
              href={`/register?next=${encodeURIComponent(nextPath === "/dashboard" ? "/challenges" : nextPath)}`}
              style={{ color: "var(--signal)" }}
            >
              Create a free account
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
