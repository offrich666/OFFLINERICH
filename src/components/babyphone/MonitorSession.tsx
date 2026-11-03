"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { MediaConnection, Peer } from "peerjs";
import { BABYPHONE_ICE_SERVERS } from "@/lib/babyphone/iceServers";
import { counterpartRole, peerJsId } from "@/lib/babyphone/peerIds";
import type { DeviceRole } from "@/lib/babyphone/types";

type Props = {
  roomId: string;
  role: DeviceRole;
  deviceName: string;
  otherNameHint?: string;
};

type MetaMessage =
  | { type: "hello"; name: string; role: DeviceRole }
  | { type: "ping" };

export function MonitorSession({ roomId, role, deviceName, otherNameHint }: Props) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<Peer | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idRetryRef = useRef(0);

  const [status, setStatus] = useState("Connecting…");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [secureOk, setSecureOk] = useState(true);
  const [otherName, setOtherName] = useState(otherNameHint || "");
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [cameraArmed, setCameraArmed] = useState(false);

  const myPeerId = peerJsId(roomId, role);
  const theirPeerId = peerJsId(roomId, counterpartRole(role));

  const attachRemoteStream = useEffectEvent((stream: MediaStream) => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = stream;
      void remoteVideoRef.current.play().catch(() => undefined);
    }
    setStatus("Live");
  });

  const startCamera = useEffectEvent(async (): Promise<MediaStream | null> => {
    if (!window.isSecureContext) {
      setSecureOk(false);
      setError("Camera needs HTTPS (or localhost). Open this site over https://");
      return null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      localStreamRef.current = stream;
      setCameraArmed(true);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not open camera";
      setError(message);
      setStatus("Camera blocked");
      return null;
    }
  });

  const callRemoter = useEffectEvent((peer: Peer, stream: MediaStream) => {
    if (callRef.current) {
      callRef.current.close();
      callRef.current = null;
    }
    setStatus("Calling remoter…");
    const call = peer.call(theirPeerId, stream, {
      metadata: { name: deviceName, role },
    });
    callRef.current = call;
    call.on("stream", (remote) => {
      // one-way baby feed; remoter usually sends nothing back
      if (remote.getTracks().length) attachRemoteStream(remote);
    });
    call.on("close", () => {
      setStatus("Remoter disconnected — waiting again");
    });
    call.on("error", () => {
      setStatus("Call failed — retrying…");
    });
  });

  const watchForRemoter = useEffectEvent((peer: Peer) => {
    const tryLink = () => {
      const stream = localStreamRef.current;
      if (!stream) return;
      // Data connection probes whether remoter peer is online.
      const conn = peer.connect(theirPeerId, { reliable: true });
      conn.on("open", () => {
        conn.send({ type: "hello", name: deviceName, role } satisfies MetaMessage);
        callRemoter(peer, stream);
        conn.close();
      });
      conn.on("error", () => {
        /* remoter not online yet */
      });
    };

    tryLink();
    if (retryTimerRef.current) clearInterval(retryTimerRef.current);
    retryTimerRef.current = setInterval(tryLink, 4000);
  });

  useEffect(() => {
    let cancelled = false;
    setSecureOk(window.isSecureContext);
    setError(null);
    setShareUrl(
      `${window.location.origin}/babyphone/${roomId}?role=remoter&name=${encodeURIComponent(
        otherNameHint || "Dad remoter",
      )}`,
    );

    async function boot() {
      const { default: PeerCtor } = await import("peerjs");
      if (cancelled) return;

      const peer = new PeerCtor(myPeerId, {
        debug: 1,
        config: { iceServers: BABYPHONE_ICE_SERVERS },
      });
      peerRef.current = peer;

      peer.on("open", async () => {
        if (cancelled) return;
        if (role === "camera") {
          setStatus("Camera online — waiting for remoter anywhere");
          const stream = await startCamera();
          if (cancelled || !stream) return;
          setStatus("Camera ready — waiting for remoter anywhere");
          watchForRemoter(peer);
        } else {
          setStatus("Remoter online — waiting for nursery camera");
        }
      });

      peer.on("connection", (conn) => {
        conn.on("data", (raw) => {
          const data = raw as MetaMessage;
          if (data?.type === "hello" && data.name) {
            setOtherName(data.name);
          }
        });
        conn.on("open", () => {
          conn.send({ type: "hello", name: deviceName, role } satisfies MetaMessage);
          if (role === "camera" && localStreamRef.current) {
            callRemoter(peer, localStreamRef.current);
          }
        });
      });

      peer.on("call", (call) => {
        if (role !== "remoter") {
          call.close();
          return;
        }
        const meta = call.metadata as { name?: string } | undefined;
        if (meta?.name) setOtherName(meta.name);
        callRef.current = call;
        call.answer();
        setStatus("Receiving baby feed…");
        call.on("stream", (remote) => attachRemoteStream(remote));
        call.on("close", () => setStatus("Camera disconnected — waiting again"));
      });

      peer.on("disconnected", () => {
        setStatus("Reconnecting signal…");
        peer.reconnect();
      });

      peer.on("error", (err: { type?: string; message?: string }) => {
        const msg = err?.type || err?.message || "Peer error";
        if (String(msg) === "unavailable-id") {
          // Common during React Strict Mode remount — retry once the old id releases.
          if (idRetryRef.current >= 3) {
            setError(
              "This room role is already open elsewhere. Close the other tab or create a new room.",
            );
            setStatus("Room role in use");
            return;
          }
          idRetryRef.current += 1;
          setStatus("Reclaiming room seat…");
          window.setTimeout(() => {
            if (cancelled) return;
            peer.destroy();
            peerRef.current = null;
            void boot();
          }, 1200);
          return;
        }
        // peer-unavailable while probing is normal
        if (String(msg) === "peer-unavailable") return;
        setStatus(`Signal: ${String(msg)}`);
      });
    }

    void boot();

    return () => {
      cancelled = true;
      if (retryTimerRef.current) clearInterval(retryTimerRef.current);
      callRef.current?.close();
      callRef.current = null;
      peerRef.current?.destroy();
      peerRef.current = null;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setCameraArmed(false);
    };
  }, [deviceName, myPeerId, otherNameHint, role, roomId, theirPeerId]);

  async function copyShare() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy — select the link manually");
    }
  }

  return (
    <div className="bp-session">
      <header className="bp-session-bar">
        <div>
          <p className="bp-kicker">Room {roomId}</p>
          <h1 className="bp-session-title">
            {deviceName}
            <span className="bp-role-pill">{role}</span>
          </h1>
        </div>
        <p className={`bp-status ${status === "Live" ? "is-live" : ""}`} aria-live="polite">
          {status}
        </p>
      </header>

      {!secureOk && (
        <p className="bp-banner" role="status">
          This browser needs a secure URL for the camera. Use the https:// site link (works on any
          network — home Wi‑Fi, guest Wi‑Fi, or mobile data).
        </p>
      )}

      {error && (
        <p className="bp-banner bp-banner-error" role="alert">
          {error}
        </p>
      )}

      {role === "camera" && shareUrl && (
        <div className="bp-share">
          <p>
            Send this link to the parent phone — any network, anywhere:
          </p>
          <code className="bp-share-url">{shareUrl}</code>
          <button type="button" className="bp-ghost-btn" onClick={() => void copyShare()}>
            {copied ? "Copied" : "Copy remoter link"}
          </button>
        </div>
      )}

      <div className={`bp-stage ${role}`}>
        {role === "camera" ? (
          <video
            ref={localVideoRef}
            className="bp-video"
            autoPlay
            playsInline
            muted
            aria-label="Local baby camera preview"
          />
        ) : (
          <video
            ref={remoteVideoRef}
            className="bp-video"
            autoPlay
            playsInline
            muted={muted}
            aria-label="Baby camera feed"
          />
        )}
        <div className="bp-stage-glow" aria-hidden />
      </div>

      <footer className="bp-session-foot">
        <p className="bp-peer-line">
          {otherName
            ? `Linked with ${otherName}`
            : role === "camera"
              ? "Parent can join from another city on mobile data"
              : "Nursery camera can be on home Wi‑Fi — you can be anywhere"}
        </p>
        {role === "remoter" && (
          <button
            type="button"
            className="bp-ghost-btn"
            onClick={() => {
              setMuted((m) => !m);
              if (remoteVideoRef.current) remoteVideoRef.current.muted = !muted;
            }}
          >
            {muted ? "Unmute baby audio" : "Mute baby audio"}
          </button>
        )}
        {role === "camera" && cameraArmed && (
          <button
            type="button"
            className="bp-ghost-btn"
            onClick={() => {
              if (peerRef.current && localStreamRef.current) {
                callRemoter(peerRef.current, localStreamRef.current);
              }
            }}
          >
            Re-send feed
          </button>
        )}
      </footer>
    </div>
  );
}
