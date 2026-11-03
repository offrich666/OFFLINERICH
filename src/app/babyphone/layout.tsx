import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./babyphone.css";

const fraunces = Fraunces({
  variable: "--font-bp-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const manrope = Manrope({
  variable: "--font-bp-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "CribLink — local babyphone",
  description:
    "Name one phone Camera and another Remoter. Watch your baby over the home Wi‑Fi.",
};

export default function BabyphoneLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`bp-page ${fraunces.variable} ${manrope.variable}`}>
      <div className="bp-sky" aria-hidden />
      <div className="bp-dust" aria-hidden />
      {children}
    </div>
  );
}
