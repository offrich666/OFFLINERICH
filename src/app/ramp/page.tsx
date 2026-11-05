import Link from "next/link";
import { MoonPayRamps, type RampMode } from "@/components/MoonPayRamps";

type Props = {
  searchParams?: Promise<{ mode?: string }>;
};

export default async function RampPage({ searchParams }: Props) {
  const params = (await searchParams) || {};
  const mode: RampMode = params.mode === "sell" ? "sell" : "buy";
  const hasKey = Boolean(process.env.NEXT_PUBLIC_MOONPAY_API_KEY);

  return (
    <main className="page ramp-page">
      <div className="atmosphere" aria-hidden />
      <div className="grain" aria-hidden />

      <header className="topbar">
        <Link href="/" className="brand-mark">
          GN Labs Crypto
        </Link>
        <span className="ghost-link">MoonPay Ramps</span>
      </header>

      <section className="ramp-layout">
        <div className="ramp-copy">
          <p className="eyebrow">Ramps</p>
          <h1>{mode === "buy" ? "Buy crypto" : "Sell crypto"}</h1>
          <p>
            Card in, crypto out — or reverse. Widget runs on MoonPay sandbox
            keys for GN Labs Crypto.
          </p>
        </div>

        <div className="ramp-panel">
          {!hasKey ? (
            <div className="setup-panel">
              <strong>Missing MoonPay publishable key</strong>
              <p>
                Set <code>NEXT_PUBLIC_MOONPAY_API_KEY</code> in{" "}
                <code>.env.local</code>.
              </p>
            </div>
          ) : (
            <MoonPayRamps initialMode={mode} />
          )}
        </div>
      </section>
    </main>
  );
}
