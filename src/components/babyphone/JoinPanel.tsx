"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { DeviceRole } from "@/lib/babyphone/types";

type LanInfo = {
  host: string;
  urls: string[];
  tip: string;
};

export function JoinPanel() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [roomId, setRoomId] = useState("");
  const [name, setName] = useState("Nursery camera");
  const [role, setRole] = useState<DeviceRole>("camera");
  const [error, setError] = useState<string | null>(null);
  const [lan, setLan] = useState<LanInfo | null>(null);

  useEffect(() => {
    void fetch("/api/babyphone/lan")
      .then((r) => r.json())
      .then((data: LanInfo) => setLan(data))
      .catch(() => setLan(null));
  }, []);

  function pickRole(next: DeviceRole) {
    setRole(next);
    setName((current) => {
      const defaults = new Set(["", "Nursery camera", "Dad remoter", "Camera", "Remoter"]);
      if (!defaults.has(current.trim())) return current;
      return next === "camera" ? "Nursery camera" : "Dad remoter";
    });
  }

  async function createAndJoin() {
    setError(null);
    const created = await fetch("/api/babyphone/rooms", { method: "POST" });
    const data = (await created.json()) as { roomId?: string; error?: string };
    if (!created.ok || !data.roomId) {
      setError(data.error || "Could not create room");
      return;
    }
    await join(data.roomId);
  }

  async function join(id: string) {
    setError(null);
    const trimmed = id.trim().toUpperCase();
    if (!trimmed) {
      setError("Enter a room code");
      return;
    }
    const res = await fetch(`/api/babyphone/rooms/${trimmed}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim() || (role === "camera" ? "Camera" : "Remoter"),
        role,
      }),
    });
    const data = (await res.json()) as {
      peer?: { id: string; name: string; role: DeviceRole };
      error?: string;
    };
    if (!res.ok || !data.peer) {
      setError(data.error || "Could not join");
      return;
    }
    const q = new URLSearchParams({
      peer: data.peer.id,
      role: data.peer.role,
      name: data.peer.name,
    });
    startTransition(() => {
      router.push(`/babyphone/${trimmed}?${q.toString()}`);
    });
  }

  return (
    <div className="bp-join">
      <div className="bp-role-grid" role="radiogroup" aria-label="Device role">
        <button
          type="button"
          role="radio"
          aria-checked={role === "camera"}
          className={`bp-role-card ${role === "camera" ? "is-active" : ""}`}
          onClick={() => pickRole("camera")}
        >
          <span className="bp-role-label">Camera</span>
          <span className="bp-role-help">Nursery phone watches the baby</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={role === "remoter"}
          className={`bp-role-card ${role === "remoter" ? "is-active" : ""}`}
          onClick={() => pickRole("remoter")}
        >
          <span className="bp-role-label">Remoter</span>
          <span className="bp-role-help">Parent phone sees & hears from afar</span>
        </button>
      </div>

      <label className="bp-field">
        <span>Device name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={role === "camera" ? "Nursery camera" : "Dad remoter"}
          maxLength={32}
          autoComplete="off"
        />
      </label>

      <label className="bp-field">
        <span>Room code</span>
        <input
          value={roomId}
          onChange={(e) => setRoomId(e.target.value.toUpperCase())}
          placeholder="Join existing — e.g. K7M2"
          maxLength={8}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      {error && (
        <p className="bp-banner bp-banner-error" role="alert">
          {error}
        </p>
      )}

      <div className="bp-actions">
        <button
          type="button"
          className="bp-primary"
          disabled={pending}
          onClick={() => void createAndJoin()}
        >
          Create nursery room
        </button>
        <button
          type="button"
          className="bp-secondary"
          disabled={pending || !roomId.trim()}
          onClick={() => void join(roomId)}
        >
          Join with code
        </button>
      </div>

      <section className="bp-lan" aria-label="Local network addresses">
        <h2>Open on both phones (same Wi‑Fi)</h2>
        <p>
          Run <code>npm run babyphone</code> on a computer at home. Then open one of these
          addresses on the nursery phone and the parent phone.
        </p>
        {lan?.urls?.length ? (
          <ul className="bp-url-list">
            {lan.urls
              .filter((u) => u.startsWith("https://"))
              .map((url) => (
                <li key={url}>
                  <code>{url}</code>
                </li>
              ))}
          </ul>
        ) : (
          <p className="bp-muted">LAN addresses appear when the server is running locally.</p>
        )}
        <p className="bp-muted">{lan?.tip}</p>
      </section>
    </div>
  );
}
