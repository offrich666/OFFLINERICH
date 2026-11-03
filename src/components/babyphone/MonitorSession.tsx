"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { DeviceRole, PeerInfo, RoomEvent, SignalMessage } from "@/lib/babyphone/types";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

type Props = {
  roomId: string;
  peerId: string;
  role: DeviceRole;
  deviceName: string;
};

export function MonitorSession({ roomId, peerId, role, deviceName }: Props) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const makingOfferRef = useRef(false);
  const remotePeerRef = useRef<string | null>(null);
  const offeredToRef = useRef<string | null>(null);
  const peersRef = useRef<PeerInfo[]>([]);

  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [status, setStatus] = useState("Connecting…");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [secureOk, setSecureOk] = useState(true);

  const sendSignal = useEffectEvent(
    async (to: string, kind: "offer" | "answer" | "ice", payload: unknown) => {
      await fetch(`/api/babyphone/rooms/${roomId}/signal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: peerId, to, kind, payload }),
      });
    },
  );

  const ensurePeerConnection = useEffectEvent((remotePeerId: string) => {
    if (pcRef.current && remotePeerRef.current === remotePeerId) {
      return pcRef.current;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    remotePeerRef.current = remotePeerId;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        void sendSignal(remotePeerId, "ice", ev.candidate.toJSON());
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "connected") setStatus("Live");
      else if (state === "connecting") setStatus("Linking devices…");
      else if (state === "failed") setStatus("Connection failed — retrying from camera");
      else if (state === "disconnected") setStatus("Reconnecting…");
    };

    pc.ontrack = (ev) => {
      const stream = ev.streams[0];
      if (remoteVideoRef.current && stream) {
        remoteVideoRef.current.srcObject = stream;
      }
    };

    const local = localStreamRef.current;
    if (local) {
      for (const track of local.getTracks()) {
        pc.addTrack(track, local);
      }
    }

    return pc;
  });

  const startCamera = useEffectEvent(async () => {
    if (!window.isSecureContext) {
      setSecureOk(false);
      setError(
        "Camera needs HTTPS (or localhost). Restart with: npm run babyphone",
      );
      return;
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
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      const remoter = peersRef.current.find((p) => p.id !== peerId && p.role === "remoter");
      if (remoter) {
        setStatus("Camera ready — linking remoter");
        void createOfferFor(remoter.id, false);
      } else {
        setStatus("Camera ready — waiting for remoter");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not open camera";
      setError(message);
      setStatus("Camera blocked");
    }
  });

  const createOfferFor = useEffectEvent(async (remotePeerId: string, force = false) => {
    if (role !== "camera") return;
    if (!localStreamRef.current) return;
    if (!force && offeredToRef.current === remotePeerId && pcRef.current) return;
    const pc = ensurePeerConnection(remotePeerId);
    if (makingOfferRef.current) return;
    makingOfferRef.current = true;
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      });
      await pc.setLocalDescription(offer);
      offeredToRef.current = remotePeerId;
      await sendSignal(remotePeerId, "offer", pc.localDescription);
      setStatus("Calling remoter…");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Offer failed");
    } finally {
      makingOfferRef.current = false;
    }
  });

  const handleSignal = useEffectEvent(async (message: SignalMessage) => {
    if (message.to !== peerId) return;
    const from = message.from;

    if (message.kind === "offer" && role === "remoter") {
      const pc = ensurePeerConnection(from);
      await pc.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal(from, "answer", pc.localDescription);
      setStatus("Receiving baby feed…");
      return;
    }

    if (message.kind === "answer" && role === "camera") {
      const pc = ensurePeerConnection(from);
      if (!pc.currentRemoteDescription) {
        await pc.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
      }
      return;
    }

    if (message.kind === "ice") {
      const pc = ensurePeerConnection(from);
      try {
        await pc.addIceCandidate(message.payload as RTCIceCandidateInit);
      } catch {
        /* candidate may arrive early; ignore */
      }
    }
  });

  const onPeers = useEffectEvent((next: PeerInfo[]) => {
    peersRef.current = next;
    setPeers(next);
    const other = next.find((p) => p.id !== peerId);
    if (!other) {
      setStatus(role === "camera" ? "Camera ready — waiting for remoter" : "Waiting for camera…");
      return;
    }
    if (role === "camera" && other.role === "remoter") {
      if (localStreamRef.current) {
        void createOfferFor(other.id, false);
      } else {
        setStatus(`Remoter ${other.name} is here — starting camera…`);
      }
    }
    if (role === "remoter" && other.role === "camera") {
      setStatus(`Waiting for ${other.name}…`);
    }
  });

  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;

    setSecureOk(window.isSecureContext);
    setError(null);

    const leave = () => {
      void fetch(`/api/babyphone/rooms/${roomId}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerId }),
        keepalive: true,
      });
    };
    window.addEventListener("pagehide", leave);

    async function boot() {
      // Re-join with the same peerId so React Strict Mode remounts still work.
      const joinRes = await fetch(`/api/babyphone/rooms/${roomId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: deviceName, role, peerId }),
      });
      const joinData = (await joinRes.json()) as { error?: string };
      if (!joinRes.ok) {
        if (!cancelled) setError(joinData.error || "Could not rejoin room");
        return;
      }
      if (cancelled) return;

      if (role === "camera") {
        void startCamera();
      } else {
        setStatus("Waiting for camera…");
      }

      es = new EventSource(
        `/api/babyphone/rooms/${roomId}/events?peerId=${encodeURIComponent(peerId)}`,
      );
      es.onmessage = (ev) => {
        let data: RoomEvent;
        try {
          data = JSON.parse(ev.data) as RoomEvent;
        } catch {
          return;
        }
        if (data.type === "hello" || data.type === "peers") {
          onPeers(data.peers);
        } else if (data.type === "signal") {
          void handleSignal(data.message);
        } else if (data.type === "error") {
          setError(data.message);
        }
      };
      es.onerror = () => {
        setStatus("Signal link interrupted — retrying…");
      };
    }

    void boot();

    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", leave);
      es?.close();
      // Do not leave the room on React effect cleanup (Strict Mode remounts).
      pcRef.current?.close();
      pcRef.current = null;
      offeredToRef.current = null;
      remotePeerRef.current = null;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    };
  }, [peerId, role, roomId, deviceName]);

  const other = peers.find((p) => p.id !== peerId);

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
          This browser needs a secure URL for the camera. On the host computer run{" "}
          <code>npm run babyphone</code>, then open the HTTPS LAN address on both phones.
        </p>
      )}

      {error && (
        <p className="bp-banner bp-banner-error" role="alert">
          {error}
        </p>
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
          {other
            ? `Linked with ${other.name} (${other.role})`
            : role === "camera"
              ? "Open this room on the parent phone as Remoter"
              : "Open this room on the nursery phone as Camera"}
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
        {role === "camera" && other?.role === "remoter" && (
          <button
            type="button"
            className="bp-ghost-btn"
            onClick={() => {
              offeredToRef.current = null;
              void createOfferFor(other.id, true);
            }}
          >
            Re-send feed
          </button>
        )}
      </footer>
    </div>
  );
}
