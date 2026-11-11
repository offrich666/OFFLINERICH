import Link from "next/link";
import FundsPanel from "@/components/funds/FundsPanel";

export const metadata = {
  title: "Funds · OFFLINERICH",
  description: "Deposit and withdraw from your OFFLINERICH balance.",
};

export default function FundsPage() {
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
          <Link href="/funds" className="ghost-link" aria-current="page">
            Funds
          </Link>
          <Link href="/sniper" className="ghost-link">
            Sniper
          </Link>
          <Link href="/auth" className="ghost-link">
            Account
          </Link>
          <Link href="/checkout" className="top-cta">
            Pay
          </Link>
        </div>
      </header>

      <section className="tokens-hero">
        <p className="tokens-kicker">Funds</p>
        <h1 className="tokens-title">Deposit & withdraw</h1>
        <p className="tokens-lede">
          Move value into your account balance, then withdraw to any linked
          wallet. Keys never leave your wallet app.
        </p>
      </section>

      <FundsPanel />
    </main>
  );
}
