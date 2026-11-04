import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { RegisterForm } from "@/components/RegisterForm";
import { getSessionUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/safeNext";

type Props = {
  searchParams: Promise<{ next?: string }>;
};

export default async function RegisterPage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  const sp = await searchParams;
  const nextPath = safeNextPath(sp.next, "/challenges");

  return (
    <main className="fxl-page">
      <div className="fxl-atmosphere" aria-hidden />
      <div className="fxl-grid" aria-hidden />
      <SiteHeader />
      <div className="fxl-shell" style={{ maxWidth: 520 }}>
        <div className="fxl-panel">
          <span className="fxl-chip">Open to all traders</span>
          <h1 style={{ marginTop: "0.75rem" }}>Create your Funded XL account</h1>
          <p className="fxl-muted">
            Register in under a minute. Choose Instant, One-Step, or Two-Step and
            start trading funded capital.
          </p>
          <RegisterForm nextPath={nextPath} />
          <p className="fxl-muted" style={{ marginTop: "1rem", fontSize: "0.88rem" }}>
            Already have an account?{" "}
            <Link
              href={`/login?next=${encodeURIComponent(nextPath)}`}
              style={{ color: "var(--signal)" }}
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
