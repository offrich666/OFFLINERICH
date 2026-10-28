"use client";

import { useEffect, useState, useTransition } from "react";
import {
  CrossmintCheckoutProvider,
  CrossmintEmbeddedCheckout,
  CrossmintProvider,
  useCrossmintCheckout,
} from "@crossmint/client-sdk-react-ui";
import { createOnrampOrder } from "@/app/actions/createOnrampOrder";
import {
  checkoutAppearance,
  type OnrampChain,
} from "@/lib/crossmint";

type OnrampCheckoutProps = {
  apiKey: string;
  defaultAmount: string;
  defaultChain: OnrampChain;
};

type ActiveOrder = {
  orderId: string;
  clientSecret: string;
  email: string;
  walletAddress: string;
};

const CHAINS: Array<{ id: OnrampChain; label: string; hint: string }> = [
  { id: "polygon", label: "Polygon", hint: "USDC" },
  { id: "base", label: "Base", hint: "USDC" },
  { id: "solana", label: "Solana", hint: "USDC" },
];

function OrderPhaseBanner() {
  const { order } = useCrossmintCheckout();
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!order) return;
    if (order.phase === "completed") {
      setNote("Payment complete. USDC is on the way to your wallet.");
    } else if (order.phase === "delivery") {
      setNote("Payment received. Delivering USDC…");
    } else if (order.phase === "payment") {
      setNote("Complete payment with card, Apple Pay, or Google Pay.");
    }
  }, [order]);

  if (!note) return null;
  return <p className="status-line">{note}</p>;
}

function EmbeddedOnramp({
  order,
  apiKey,
}: {
  order: ActiveOrder;
  apiKey: string;
}) {
  return (
    <CrossmintProvider apiKey={apiKey}>
      <CrossmintCheckoutProvider>
        <div className="checkout-shell onramp-embed">
          <OrderPhaseBanner />
          <p className="wallet-chip">
            Delivering to <code>{order.walletAddress}</code>
          </p>
          <CrossmintEmbeddedCheckout
            orderId={order.orderId}
            clientSecret={order.clientSecret}
            appearance={checkoutAppearance}
            payment={{
              receiptEmail: order.email,
              defaultMethod: "fiat",
              crypto: { enabled: false },
              fiat: {
                enabled: true,
                defaultCurrency: "usd",
                allowedMethods: {
                  card: true,
                  applePay: true,
                  googlePay: true,
                },
              },
            }}
          />
        </div>
      </CrossmintCheckoutProvider>
    </CrossmintProvider>
  );
}

export function OnrampCheckout({
  apiKey,
  defaultAmount,
  defaultChain,
}: OnrampCheckoutProps) {
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState(defaultAmount);
  const [chain, setChain] = useState<OnrampChain>(defaultChain);
  const [walletOverride, setWalletOverride] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockedHint, setBlockedHint] = useState<string | null>(null);
  const [order, setOrder] = useState<ActiveOrder | null>(null);
  const [pending, startTransition] = useTransition();

  if (!apiKey) {
    return (
      <div className="setup-panel">
        <h2>Missing client API key</h2>
        <p>
          Add <code>NEXT_PUBLIC_CROSSMINT_API_KEY</code> to{" "}
          <code>.env.local</code> and restart the server.
        </p>
      </div>
    );
  }

  function startCheckout() {
    setError(null);
    setBlockedHint(null);
    startTransition(async () => {
      const result = await createOnrampOrder({
        email,
        amount,
        chain,
        walletAddress: walletOverride.trim() || undefined,
      });

      if (!result.ok) {
        setError(result.message);
        if (
          result.message.toLowerCase().includes("onramp is not yet enabled") ||
          result.message.toLowerCase().includes("contact our team")
        ) {
          setBlockedHint(
            "Production onramp is not enabled on this Crossmint project yet. Test with staging keys, or ask Crossmint Sales to enable production (Order Form + KYB).",
          );
        }
        return;
      }

      setOrder({
        orderId: result.orderId,
        clientSecret: result.clientSecret,
        email: email.trim().toLowerCase(),
        walletAddress: result.walletAddress,
      });
    });
  }

  if (order) {
    return (
      <div className="onramp-flow">
        <button
          type="button"
          className="ghost-link reset-link"
          onClick={() => setOrder(null)}
        >
          Start over
        </button>
        <EmbeddedOnramp order={order} apiKey={apiKey} />
      </div>
    );
  }

  return (
    <div className="onramp-form">
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <span className="field-hint">
          Receipt + KYC + Crossmint wallet recovery use this address.
        </span>
      </div>

      <div className="field">
        <span className="label-like">Network</span>
        <div className="chain-grid" role="radiogroup" aria-label="Network">
          {CHAINS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={chain === item.id}
              className={chain === item.id ? "chain-btn active" : "chain-btn"}
              onClick={() => setChain(item.id)}
            >
              <strong>{item.label}</strong>
              <span>{item.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="amount">Amount (USD)</label>
        <input
          id="amount"
          type="number"
          min={1}
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <span className="field-hint">
          Buys USDC via card, Apple Pay, or Google Pay.
        </span>
      </div>

      <button
        type="button"
        className="text-toggle"
        onClick={() => setShowAdvanced((v) => !v)}
      >
        {showAdvanced ? "Hide" : "Use"} external wallet instead
      </button>

      {showAdvanced ? (
        <div className="field">
          <label htmlFor="wallet">Destination wallet</label>
          <input
            id="wallet"
            type="text"
            spellCheck={false}
            placeholder="0x… or Solana address"
            value={walletOverride}
            onChange={(e) => setWalletOverride(e.target.value)}
          />
          <span className="field-hint">
            Leave blank to auto-create a Crossmint wallet for the email.
          </span>
        </div>
      ) : null}

      {error ? <p className="error-line">{error}</p> : null}
      {blockedHint ? <p className="blocked-hint">{blockedHint}</p> : null}

      <button
        type="button"
        className="primary-cta full-width"
        disabled={pending || !email}
        onClick={startCheckout}
      >
        {pending ? "Creating order…" : "Continue to secure checkout"}
      </button>

      <ul className="pay-methods">
        <li>Card</li>
        <li>Apple Pay</li>
        <li>Google Pay</li>
      </ul>
    </div>
  );
}
