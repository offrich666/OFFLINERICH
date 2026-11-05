"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";

const MoonPayBuyWidget = dynamic(
  () => import("@moonpay/moonpay-react").then((mod) => mod.MoonPayBuyWidget),
  { ssr: false },
);

const MoonPaySellWidget = dynamic(
  () => import("@moonpay/moonpay-react").then((mod) => mod.MoonPaySellWidget),
  { ssr: false },
);

export type RampMode = "buy" | "sell";

const BUY_ASSETS = [
  { code: "eth", label: "Ethereum" },
  { code: "btc", label: "Bitcoin" },
  { code: "usdc", label: "USDC" },
  { code: "sol", label: "Solana" },
] as const;

type Props = {
  initialMode?: RampMode;
};

export function MoonPayRamps({ initialMode = "buy" }: Props) {
  const [mode, setMode] = useState<RampMode>(initialMode);
  const [amount, setAmount] = useState("100");
  const [asset, setAsset] = useState<string>("eth");
  const [wallet, setWallet] = useState("");
  const [email, setEmail] = useState("");
  const [visible, setVisible] = useState(true);
  const [signError, setSignError] = useState<string | null>(null);

  const amountNumber = Number(amount);
  const amountOk = Number.isFinite(amountNumber) && amountNumber > 0;

  const handleSignature = useCallback(async (url: string) => {
    setSignError(null);
    const res = await fetch("/api/moonpay/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = (await res.json()) as { signature?: string; error?: string };
    if (!res.ok || !data.signature) {
      const msg = data.error || "Could not sign MoonPay URL";
      setSignError(msg);
      throw new Error(msg);
    }
    return data.signature;
  }, []);

  const buyProps = useMemo(
    () => ({
      variant: "embedded" as const,
      baseCurrencyCode: "usd",
      baseCurrencyAmount: amountOk ? String(amountNumber) : "100",
      defaultCurrencyCode: asset,
      ...(email.trim() ? { email: email.trim() } : {}),
      ...(wallet.trim() ? { walletAddress: wallet.trim() } : {}),
      ...(wallet.trim()
        ? { onUrlSignatureRequested: handleSignature }
        : {}),
      visible,
      colorCode: "#1ec8a5",
    }),
    [amountNumber, amountOk, asset, email, handleSignature, visible, wallet],
  );

  const sellProps = useMemo(
    () => ({
      variant: "embedded" as const,
      baseCurrencyCode: asset,
      baseCurrencyAmount: amountOk ? String(amountNumber) : undefined,
      quoteCurrencyCode: "usd",
      ...(email.trim() ? { email: email.trim() } : {}),
      ...(wallet.trim() ? { refundWalletAddress: wallet.trim() } : {}),
      visible,
      colorCode: "#1ec8a5",
    }),
    [amountNumber, amountOk, asset, email, visible, wallet],
  );

  return (
    <div className="ramp-shell">
      <div className="mode-toggle" role="tablist" aria-label="Buy or sell">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "buy"}
          className={mode === "buy" ? "mode-btn active" : "mode-btn"}
          onClick={() => {
            setMode("buy");
            setVisible(true);
          }}
        >
          Buy
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "sell"}
          className={mode === "sell" ? "mode-btn active" : "mode-btn"}
          onClick={() => {
            setMode("sell");
            setVisible(true);
          }}
        >
          Sell
        </button>
      </div>

      <div className="ramp-controls">
        <label>
          Asset
          <select value={asset} onChange={(e) => setAsset(e.target.value)}>
            {BUY_ASSETS.map((a) => (
              <option key={a.code} value={a.code}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {mode === "buy" ? "USD amount" : "Crypto amount"}
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={mode === "buy" ? "100" : "0.05"}
          />
        </label>
        <label>
          Email (optional)
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </label>
        <label>
          Wallet (optional)
          <input
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            placeholder={asset === "btc" ? "bc1…" : "0x…"}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      </div>

      {signError ? <p className="ramp-error">{signError}</p> : null}

      <div className="moonpay-frame" data-mode={mode}>
        {mode === "buy" ? (
          <MoonPayBuyWidget key={`buy-${asset}-${amount}`} {...buyProps} />
        ) : (
          <MoonPaySellWidget key={`sell-${asset}-${amount}`} {...sellProps} />
        )}
      </div>

      <p className="fineprint">
        Powered by MoonPay sandbox. Test mode — no live funds move with{" "}
        <code>pk_test</code> keys.
      </p>
    </div>
  );
}
