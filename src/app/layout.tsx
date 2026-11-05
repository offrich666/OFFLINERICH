import type { Metadata } from "next";
import { Figtree, Syne } from "next/font/google";
import { MoonPayProviderClient } from "@/components/MoonPayProviderClient";
import "./globals.css";

const syne = Syne({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const figtree = Figtree({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "GN Labs Crypto",
  description: "GN Labs Crypto — buy and sell crypto with MoonPay Ramps.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const apiKey = process.env.NEXT_PUBLIC_MOONPAY_API_KEY || "";
  const debug = apiKey.includes("_test_");

  return (
    <html lang="en" className={`${syne.variable} ${figtree.variable} h-full`}>
      <body className="min-h-full antialiased">
        <MoonPayProviderClient apiKey={apiKey} debug={debug}>
          {children}
        </MoonPayProviderClient>
      </body>
    </html>
  );
}
