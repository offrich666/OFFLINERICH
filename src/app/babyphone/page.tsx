import Link from "next/link";
import { JoinPanel } from "@/components/babyphone/JoinPanel";

export default function BabyphoneHome() {
  return (
    <main className="bp-shell">
      <header className="bp-top">
        <h1 className="bp-brand">CribLink</h1>
        <Link href="/" className="bp-home-link">
          Home
        </Link>
      </header>
      <p className="bp-hero-copy">
        Local babyphone for home Wi‑Fi. One phone is the nursery camera. The other is the
        parent remoter — see and hear how the baby is sleeping from another room.
      </p>
      <JoinPanel />
    </main>
  );
}
