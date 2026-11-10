"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { StripeOnramp } from "@stripe/crypto";

type OnrampContextValue = {
  onramp: StripeOnramp | null;
};

const CryptoElementsContext = createContext<OnrampContextValue>({
  onramp: null,
});

export function CryptoElements({
  stripeOnramp,
  children,
}: {
  stripeOnramp: Promise<StripeOnramp | null>;
  children: ReactNode;
}) {
  const [ctx, setCtx] = useState<OnrampContextValue>({ onramp: null });

  useEffect(() => {
    let alive = true;
    void Promise.resolve(stripeOnramp).then((onramp) => {
      if (alive && onramp) {
        setCtx((prev) => (prev.onramp ? prev : { onramp }));
      }
    });
    return () => {
      alive = false;
    };
  }, [stripeOnramp]);

  return (
    <CryptoElementsContext.Provider value={ctx}>
      {children}
    </CryptoElementsContext.Provider>
  );
}

function useStripeOnramp() {
  return useContext(CryptoElementsContext).onramp;
}

type OnrampElementProps = {
  clientSecret: string;
  appearance?: { theme: "light" | "dark" };
  className?: string;
  style?: CSSProperties;
  onReady?: () => void;
  onError?: (message: string) => void;
  onComplete?: () => void;
};

export function OnrampElement({
  clientSecret,
  appearance = { theme: "dark" },
  className,
  style,
  onReady,
  onError,
  onComplete,
}: OnrampElementProps) {
  const stripeOnramp = useStripeOnramp();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !clientSecret || !stripeOnramp) return;

    el.innerHTML = "";
    setMounted(false);
    let cancelled = false;

    try {
      const session = stripeOnramp.createSession({
        clientSecret,
        appearance,
      });

      session.mount(el);

      const onChange = (...args: unknown[]) => {
        const event = args[0] as
          | { payload?: { session?: { status?: string } } }
          | undefined;
        const status = event?.payload?.session?.status;
        if (
          status === "fulfillment_complete" ||
          status === "fulfillment_processing"
        ) {
          onComplete?.();
        }
      };

      const maybeSession = session as unknown as {
        addEventListener?: (name: string, fn: (...a: unknown[]) => void) => void;
        removeEventListener?: (
          name: string,
          fn: (...a: unknown[]) => void,
        ) => void;
        on?: (name: string, fn: (...a: unknown[]) => void) => void;
      };
      maybeSession.addEventListener?.("onramp_session_updated", onChange);
      maybeSession.on?.("change", onChange);

      if (!cancelled) {
        setMounted(true);
        onReady?.();
      }

      return () => {
        cancelled = true;
        maybeSession.removeEventListener?.("onramp_session_updated", onChange);
        el.innerHTML = "";
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to open Stripe Onramp";
      onError?.(message);
    }
  }, [clientSecret, stripeOnramp, appearance, onReady, onError, onComplete]);

  return (
    <div className="stripe-onramp-mount-wrap">
      {!stripeOnramp || !mounted ? (
        <p className="form-hint instant-buy-hint">Loading Stripe Onramp…</p>
      ) : null}
      <div ref={containerRef} className={className} style={style} />
    </div>
  );
}
