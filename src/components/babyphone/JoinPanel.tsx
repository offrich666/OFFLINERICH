"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { makeRoomCode } from "@/lib/babyphone/peerIds";
import type { DeviceRole } from "@/lib/babyphone/types";

export function JoinPanel() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [roomId, setRoomId] = useState("");
  const [name, setName] = useState("Nursery camera");
  const [role, setRole] = useState<DeviceRole>("camera");
  const [error, setError] = useState<string | null>(null);
  const [publicUrl, setPublicUrl] = useState("");

  useEffect(() => {
    setPublicUrl(`${window.location.origin}/babyphone`);
  }, []);

  function pickRole(next: DeviceRole) {
    setRole(next);
    setName((current) => {
      const defaults = new Set(["", "Nursery camera", "Dad remoter", "Camera", "Remoter"]);
      if (!defaults.has(current.trim())) return current;
      return next === "camera" ? "Nursery camera" : "Dad remoter";
    });
  }

  function go(id: string) {
    const trimmed = id.trim().toUpperCase();
    if (!trimmed) {
      setError("Enter a room code");
      return;
    }
    const device = name.trim() || (role === "camera" ? "Camera" : "Remoter");
    const q = new URLSearchParams({
      role,
      name: device,
    });
    startTransition(() => {
      router.push(`/babyphone/${trimmed}?${q.toString()}`);
    });
  }

  function createAndJoin() {
    setError(null);
    go(makeRoomCode());
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
          <span className="bp-role-help">Parent phone — any Wi‑Fi or mobile data</span>
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
          onClick={createAndJoin}
        >
          Create nursery room
        </button>
        <button
          type="button"
          className="bp-secondary"
          disabled={pending || !roomId.trim()}
          onClick={() => {
            setError(null);
            go(roomId);
          }}
        >
          Join with code
        </button>
      </div>

      <section className="bp-lan" aria-label="Anywhere access">
        <h2>Works from any network</h2>
        <p>
          Nursery phone and parent phone do <strong>not</strong> need the same Wi‑Fi. Dad can watch
          from work or mobile data. Both open this site, same room code (or the remoter link).
        </p>
        {publicUrl ? (
          <ul className="bp-url-list">
            <li>
              <code>{publicUrl}</code>
            </li>
          </ul>
        ) : null}
        <p className="bp-muted">
          Tip: create the room on the camera, then copy the remoter link and send it by SMS or chat.
        </p>
      </section>
    </div>
  );
}
