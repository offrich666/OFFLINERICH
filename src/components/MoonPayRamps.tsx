"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

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
  const [amount, setAmount] = useState(initialMode === "sell" ? "0.05" : "100");
  const [asset, setAsset] = useState<string>("eth");
  const [wallet, setWallet] = useState("");
  const [email, setEmail] = useState("");
  const [visible, setVisible] = useState(true);
  const [signError, setSignError] = useState<string | null>(null);
  const [allowedIpAddress, setAllowedIpAddress] = useState<string | null>(null);
  const [ipReady, setIpReady] = useState(false);
  const [ipError, setIpError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/moonpay/client-ip", { cache: "no-store" });
        const data = (await res.json()) as {
          allowedIpAddress?: string;
          error?: string;
        };
        if (!res.ok || !data.allowedIpAddress) {
          throw new Error(data.error || "Could not prepare MoonPay IP match");
        }
        if (!cancelled) {
          setAllowedIpAddress(data.allowedIpAddress);
          setIpError(null);
          setIpReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          setIpError(err instanceof Error ? err.message : "IP prep failed");
          setIpReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const amountNumber = Number(amount);
  const amountOk = Number.isFinite(amountNumber) && amountNumber > 0;
  const walletTrim = wallet.trim();
  const emailTrim = email.trim();
  const amountStr = amountOk ? String(amountNumber) : mode === "buy" ? "100" : "0.05";

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

  const widgetKey = `${mode}-${asset}-${amountStr}-${walletTrim}-${emailTrim}-${allowedIpAddress || "noip"}`;

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
            setAmount((prev) => (Number(prev) < 1 ? "100" : prev));
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
            setAmount((prev) => (Number(prev) > 10 ? "0.05" : prev));
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

      {ipError ? <p className="ramp-error">{ipError}</p> : null}
      {signError ? <p className="ramp-error">{signError}</p> : null}

      <div className="moonpay-frame" data-mode={mode}>
        {!ipReady ? (
          <div className="setup-panel">Preparing MoonPay session…</div>
        ) : mode === "buy" ? (
          <MoonPayBuyWidget
            key={widgetKey}
            variant="embedded"
            baseCurrencyCode="usd"
            baseCurrencyAmount={amountStr}
            defaultCurrencyCode={asset}
            visible={visible}
            onUrlSignatureRequested={handleSignature}
            {...(allowedIpAddress ? { allowedIpAddress } : {})}
            {...(emailTrim ? { email: emailTrim } : {})}
            {...(walletTrim ? { walletAddress: walletTrim } : {})}
          />
        ) : (
          <MoonPaySellWidget
            key={widgetKey}
            variant="embedded"
            baseCurrencyCode={asset}
            baseCurrencyAmount={amountStr}
            quoteCurrencyCode="usd"
            visible={visible}
            onUrlSignatureRequested={handleSignature}
            {...(emailTrim ? { email: emailTrim } : {})}
            {...(walletTrim ? { refundWalletAddress: walletTrim } : {})}
          />
        )}
      </div>

      <p className="fineprint">
        MoonPay partner sandbox with signed URLs + IP matching. Add your domain under
        MoonPay Dashboard → Developers → Domains when you deploy.
      </p>
    </div>
  );
}
