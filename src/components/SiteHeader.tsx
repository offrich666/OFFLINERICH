import Link from "next/link";

type Props = {
  signedIn?: boolean;
};

export function SiteHeader({ signedIn }: Props) {
  return (
    <header className="fxl-topbar">
      <Link href="/" className="fxl-brand">
        <span className="fxl-brand-mark">FUNDED</span>
        <span className="fxl-brand-xl">XL</span>
      </Link>
      <nav className="fxl-nav">
        <Link href="/challenges">Challenges</Link>
        <Link href="/#rules">Rules</Link>
        {signedIn ? (
          <Link href="/dashboard" className="fxl-nav-cta">
            Dashboard
          </Link>
        ) : (
          <>
            <Link href="/login">Login</Link>
            <Link href="/challenges" className="fxl-nav-cta">
              Get Funded
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
