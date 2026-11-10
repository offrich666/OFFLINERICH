import Link from "next/link";
import AuthPanel from "@/components/auth/AuthPanel";

export const metadata = {
  title: "Account · OFFLINERICH",
  description: "Create an account to connect wallets and manage snipes.",
};

type Props = {
  searchParams: Promise<{ next?: string; mode?: string }>;
};

export default async function AuthPage({ searchParams }: Props) {
  const params = await searchParams;
  const nextPath =
    params.next && params.next.startsWith("/") ? params.next : "/tokens";
  const initialMode = params.mode === "login" ? "login" : "register";

  return (
    <main className="page tokens-page">
      <div className="atmosphere" aria-hidden />
      <div className="grain" aria-hidden />

      <header className="topbar">
        <Link href="/" className="brand-mark">
          OFFLINERICH
        </Link>
        <div className="topbar-actions">
          <Link href="/tokens" className="ghost-link">
            Tokens
          </Link>
          <Link href="/checkout" className="top-cta">
            Pay
          </Link>
        </div>
      </header>

      <section className="tokens-hero">
        <p className="tokens-kicker">Account</p>
        <h1 className="tokens-title">Register to connect</h1>
        <p className="tokens-lede">
          Create a user, then link wallets (up to 300) and run snipes from one
          dashboard.
        </p>
      </section>

      <AuthPanel initialMode={initialMode} nextPath={nextPath} />
    </main>
  );
}
