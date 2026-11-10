import Link from "next/link";
import TokenScreener from "@/components/tokens/TokenScreener";
import WalletConnectPanel from "@/components/tokens/WalletConnectPanel";

export const metadata = {
  title: "Tokens · OFFLINERICH",
  description: "Live DEX token screener — price, volume, liquidity, and movers.",
};

export default function TokensPage() {
  return (
    <main className="page tokens-page">
      <div className="atmosphere" aria-hidden />
      <div className="grain" aria-hidden />

      <header className="topbar">
        <Link href="/" className="brand-mark">
          OFFLINERICH
        </Link>
        <div className="topbar-actions">
          <Link href="/tokens" className="ghost-link" aria-current="page">
            Tokens
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
        <p className="tokens-kicker">Live markets</p>
        <h1 className="tokens-title">Token screener</h1>
        <p className="tokens-lede">
          Register an account, link up to 300 wallets, then track pairs and arm
          snipes from one place.
        </p>
      </section>

      <WalletConnectPanel />
      <TokenScreener />
    </main>
  );
}
