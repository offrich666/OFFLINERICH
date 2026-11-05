"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const MoonPayProvider = dynamic(
  () => import("@moonpay/moonpay-react").then((mod) => mod.MoonPayProvider),
  { ssr: false },
);

type Props = {
  children: ReactNode;
  apiKey: string;
  debug?: boolean;
};

export function MoonPayProviderClient({ children, apiKey, debug }: Props) {
  if (!apiKey) return <>{children}</>;
  return (
    <MoonPayProvider apiKey={apiKey} debug={debug}>
      {children}
    </MoonPayProvider>
  );
}
