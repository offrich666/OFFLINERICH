"use client";

import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  onReset?: () => void;
};

type State = {
  hasError: boolean;
  message: string | null;
};

export class CheckoutErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: null };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || "Checkout crashed while loading.",
    };
  }

  componentDidCatch(error: Error) {
    // Crossmint iframe + React 19.2 DEV logger can throw SecurityError on
    // cross-origin Window props and leave the fiber tree broken.
    console.warn("[checkout-boundary]", error.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="setup-panel">
          <h2>Checkout failed to load</h2>
          <p>
            {this.state.message?.includes("cross-origin") ||
            this.state.message?.includes("Should not already be working")
              ? "A known React development-mode conflict with the Crossmint iframe was caught. Reload checkout to continue."
              : this.state.message}
          </p>
          <button
            type="button"
            className="primary-cta"
            onClick={() => {
              this.setState({ hasError: false, message: null });
              this.props.onReset?.();
            }}
          >
            Reload checkout
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
