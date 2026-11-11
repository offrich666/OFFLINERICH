"use client";

import { useEffect, useState } from "react";
import {
  CrossmintCheckoutProvider,
  CrossmintEmbeddedCheckout,
  CrossmintProvider,
  useCrossmintCheckout,
} from "@crossmint/client-sdk-react-ui";
import { createOnrampOrder } from "@/app/actions/createOnrampOrder";
import { CheckoutErrorBoundary } from "@/components/CheckoutErrorBoundary";
import {
  checkoutAppearance,
  getClientApiKey,
  type OnrampChain,
} from "@/lib/crossmint";

type Props = {
  amountUsd: number;
  network: string;
  walletAddress: string;
  email: string;
  onPaid?: () => void;
  onFailed?: (message: string) => void;
};

type ActiveOrder = {
  orderId: string;
  clientSecret: string;
  email: string;
  walletAddress: string;
};

function mapToOnrampChain(network: string): OnrampChain {
  const n = network.trim().toLowerCase();
  if (n === "base") return "base";
  if (n === "solana") return "solana";
  return "polygon";
}

function OrderPhaseBanner({ onPaid }: { onPaid?: () => void }) {
  const { order } = useCrossmintCheckout();

  useEffect(() => {
    if (!order) return;
    if (order.phase === "completed" || order.phase === "delivery") {
      onPaid?.();
    }
  }, [order, onPaid]);

  if (!order) return null;
  if (order.phase === "completed") {
    return (
      <p className="form-hint instant-paid-note" role="status">
        Payment complete. USDC is on the way to your wallet.
      </p>
    );
  }
  if (order.phase === "delivery") {
    return (
      <p className="form-hint instant-buy-hint" role="status">
        Payment received. Delivering USDC…
      </p>
    );
  }
  return (
    <p className="form-hint instant-buy-hint">
      Pay with card / Apple Pay / Google Pay below. Stays on this page.
    </p>
  );
}

/**
 * Crossmint Business B2C onramp — embedded on checkout (no Paybis redirect).
 */
export function CrossmintB2CEmbed({
  amountUsd,
  network,
  walletAddress,
  email,
  onPaid,
  onFailed,
}: Props) {
  const apiKey = getClientApiKey();
  const [order, setOrder] = useState<ActiveOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mountKey, setMountKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      setLoading(true);
      setError(null);
      setOrder(null);

      if (!apiKey) {
        const message =
          "Crossmint Business B2C needs NEXT_PUBLIC_CROSSMINT_API_KEY.";
        if (!cancelled) {
          setError(message);
          onFailed?.(message);
          setLoading(false);
        }
        return;
      }

      try {
        const result = await createOnrampOrder({
          email: email.trim().toLowerCase(),
          amount: String(amountUsd),
          chain: mapToOnrampChain(network),
          walletAddress: walletAddress.trim() || undefined,
        });

        if (!result.ok) {
          throw new Error(result.message);
        }
        if (cancelled) return;
        setOrder({
          orderId: result.orderId,
          clientSecret: result.clientSecret,
          email: email.trim().toLowerCase(),
          walletAddress: result.walletAddress,
        });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Could not start Crossmint Business B2C";
        if (!cancelled) {
          setError(message);
          onFailed?.(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void start();
    return () => {
      cancelled = true;
    };
  }, [amountUsd, network, walletAddress, email, apiKey, onFailed]);

  if (loading) {
    return (
      <div className="stripe-embed onramp-embed thirdweb-instant-embed">
        <p className="form-hint instant-buy-hint">
          Opening Crossmint Business B2C…
        </p>
      </div>
    );
  }

  if (error || !order || !apiKey) {
    return (
      <p className="form-error">
        {error || "Crossmint Business B2C is unavailable right now."}
      </p>
    );
  }

  return (
    <div className="stripe-embed onramp-embed thirdweb-instant-embed">
      <CheckoutErrorBoundary onReset={() => setMountKey((k) => k + 1)}>
        <CrossmintProvider key={mountKey} apiKey={apiKey}>
          <CrossmintCheckoutProvider>
            <OrderPhaseBanner onPaid={onPaid} />
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
          </CrossmintCheckoutProvider>
        </CrossmintProvider>
      </CheckoutErrorBoundary>
    </div>
  );
}
