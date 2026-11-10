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

const DEFAULT_APPEARANCE = { theme: "dark" as const };

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

/**
 * Mount Stripe Crypto Onramp once per clientSecret.
 * Callbacks are stored in refs so parent re-renders (status/email/Link)
 * do NOT remount the widget back to Continue.
 */
export function OnrampElement({
  clientSecret,
  appearance = DEFAULT_APPEARANCE,
  className,
  style,
  onReady,
  onError,
  onComplete,
}: OnrampElementProps) {
  const stripeOnramp = useStripeOnramp();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const onCompleteRef = useRef(onComplete);
  const appearanceTheme = appearance.theme;

  useEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
    onCompleteRef.current = onComplete;
  }, [onReady, onError, onComplete]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !clientSecret || !stripeOnramp) return;

    el.innerHTML = "";
    setMounted(false);
    let cancelled = false;

    try {
      const session = stripeOnramp.createSession({
        clientSecret,
        appearance: { theme: appearanceTheme },
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
          onCompleteRef.current?.();
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
        onReadyRef.current?.();
      }

      return () => {
        cancelled = true;
        maybeSession.removeEventListener?.("onramp_session_updated", onChange);
        // Do not wipe DOM on soft React Strict Mode double-invoke mid-interaction
        // beyond the cancelled flag — only clear when this effect truly tears down.
        el.innerHTML = "";
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to open Stripe Onramp";
      onErrorRef.current?.(message);
    }
  }, [clientSecret, stripeOnramp, appearanceTheme]);

  return (
    <div className="stripe-onramp-mount-wrap">
      {!stripeOnramp || !mounted ? (
        <p className="form-hint instant-buy-hint">Loading Stripe Onramp…</p>
      ) : null}
      <div ref={containerRef} className={className} style={style} />
    </div>
  );
}
