import Link from "next/link";
import { MonitorSession } from "@/components/babyphone/MonitorSession";
import type { DeviceRole } from "@/lib/babyphone/types";

type Props = {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ role?: string; name?: string }>;
};

export default async function BabyphoneRoomPage({ params, searchParams }: Props) {
  const { roomId } = await params;
  const query = await searchParams;
  const role = query.role === "camera" || query.role === "remoter" ? (query.role as DeviceRole) : null;
  const name = query.name?.trim() || (role === "camera" ? "Camera" : "Remoter");

  if (!role) {
    return (
      <main className="bp-shell">
        <header className="bp-top">
          <h1 className="bp-brand">CribLink</h1>
          <Link href="/babyphone" className="bp-home-link">
            Back
          </Link>
        </header>
        <p className="bp-hero-copy">
          Open this room from the join screen so this device gets a name and role (camera or
          remoter).
        </p>
        <div className="bp-actions">
          <Link
            href={`/babyphone/${roomId.toUpperCase()}?role=camera&name=${encodeURIComponent("Nursery camera")}`}
            className="bp-primary"
          >
            Join as camera
          </Link>
          <Link
            href={`/babyphone/${roomId.toUpperCase()}?role=remoter&name=${encodeURIComponent("Dad remoter")}`}
            className="bp-secondary"
          >
            Join as remoter
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="bp-shell">
      <MonitorSession
        roomId={roomId.toUpperCase()}
        role={role}
        deviceName={name}
        otherNameHint={role === "camera" ? "Dad remoter" : "Nursery camera"}
      />
    </main>
  );
}
