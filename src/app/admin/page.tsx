import Link from "next/link";
import AdminPanel from "@/components/admin/AdminPanel";

export const metadata = {
  title: "Admin · OFFLINERICH",
  description: "Admin panel for user accounts and linked wallets.",
};

export default function AdminPage() {
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
        <p className="tokens-kicker">Head admin</p>
        <h1 className="tokens-title">User control</h1>
        <p className="tokens-lede">
          View registered users, linked wallet addresses, and reset passwords.
          Private keys are never stored.
        </p>
      </section>

      <AdminPanel />
    </main>
  );
}
