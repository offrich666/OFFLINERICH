import { randomBytes } from "crypto";
import os from "os";
import type {
  DeviceRole,
  PeerInfo,
  RoomEvent,
  SignalMessage,
} from "@/lib/babyphone/types";

export type { DeviceRole, PeerInfo, RoomEvent, SignalMessage };

type Subscriber = {
  peerId: string;
  send: (event: RoomEvent) => void;
};

type Room = {
  id: string;
  createdAt: number;
  peers: Map<string, PeerInfo>;
  subscribers: Set<Subscriber>;
  signals: SignalMessage[];
};

type Store = {
  rooms: Map<string, Room>;
};

const globalForBaby = globalThis as typeof globalThis & {
  __babyphoneStore?: Store;
};

function store(): Store {
  if (!globalForBaby.__babyphoneStore) {
    globalForBaby.__babyphoneStore = { rooms: new Map() };
  }
  return globalForBaby.__babyphoneStore;
}

function code(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(4);
  let out = "";
  for (let i = 0; i < 4; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

function pruneRoom(room: Room) {
  const now = Date.now();
  if (room.peers.size === 0 && now - room.createdAt > 1000 * 60 * 30) {
    store().rooms.delete(room.id);
  }
  room.signals = room.signals.filter((s) => now - s.createdAt < 1000 * 60 * 5);
}

export function createRoom(): Room {
  let id = code();
  while (store().rooms.has(id)) id = code();
  const room: Room = {
    id,
    createdAt: Date.now(),
    peers: new Map(),
    subscribers: new Set(),
    signals: [],
  };
  store().rooms.set(id, room);
  return room;
}

export function getRoom(roomId: string): Room | undefined {
  const room = store().rooms.get(roomId.toUpperCase());
  if (room) pruneRoom(room);
  return room;
}

export function listLanUrls(port: number, path = "/babyphone"): string[] {
  const urls: string[] = [];
  const nets = os.networkInterfaces();
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      urls.push(`https://${entry.address}:${port}${path}`);
      urls.push(`http://${entry.address}:${port}${path}`);
    }
  }
  return urls;
}

function broadcast(room: Room, event: RoomEvent, exceptPeerId?: string) {
  for (const sub of room.subscribers) {
    if (exceptPeerId && sub.peerId === exceptPeerId) continue;
    try {
      sub.send(event);
    } catch {
      room.subscribers.delete(sub);
    }
  }
}

function peersSnapshot(room: Room): PeerInfo[] {
  return Array.from(room.peers.values()).sort((a, b) => a.joinedAt - b.joinedAt);
}

export function joinRoom(
  roomId: string,
  input: { name: string; role: DeviceRole; peerId?: string },
): { room: Room; peer: PeerInfo } | { error: string } {
  const room = getRoom(roomId);
  if (!room) return { error: "Room not found. Create a new nursery link." };

  const name = input.name.trim().slice(0, 32) || (input.role === "camera" ? "Camera" : "Remoter");
  const role = input.role;

  for (const peer of room.peers.values()) {
    if (peer.role === role && peer.id !== input.peerId) {
      return {
        error:
          role === "camera"
            ? "A camera is already in this room. Use another room or rename that device."
            : "A remoter is already in this room. Open a second room for another parent phone.",
      };
    }
  }

  const existing = input.peerId ? room.peers.get(input.peerId) : undefined;
  const peer: PeerInfo = {
    id: existing?.id || input.peerId || randomBytes(8).toString("hex"),
    name,
    role,
    joinedAt: existing?.joinedAt ?? Date.now(),
  };
  room.peers.set(peer.id, peer);
  broadcast(room, { type: "peers", peers: peersSnapshot(room) });
  return { room, peer };
}

export function leaveRoom(roomId: string, peerId: string) {
  const room = getRoom(roomId);
  if (!room) return;
  room.peers.delete(peerId);
  for (const sub of room.subscribers) {
    if (sub.peerId === peerId) room.subscribers.delete(sub);
  }
  broadcast(room, { type: "peers", peers: peersSnapshot(room) });
  pruneRoom(room);
}

export function subscribe(
  roomId: string,
  peerId: string,
  send: (event: RoomEvent) => void,
): (() => void) | { error: string } {
  const room = getRoom(roomId);
  if (!room) return { error: "Room not found" };
  if (!room.peers.has(peerId)) return { error: "Join the room before listening" };

  const sub: Subscriber = { peerId, send };
  room.subscribers.add(sub);
  send({ type: "hello", peerId, roomId: room.id, peers: peersSnapshot(room) });

  for (const message of room.signals) {
    if (message.to === peerId) send({ type: "signal", message });
  }

  return () => {
    room.subscribers.delete(sub);
  };
}

export function postSignal(
  roomId: string,
  input: {
    from: string;
    to: string;
    kind: "offer" | "answer" | "ice";
    payload: unknown;
  },
): { ok: true } | { error: string } {
  const room = getRoom(roomId);
  if (!room) return { error: "Room not found" };
  if (!room.peers.has(input.from)) return { error: "Sender is not in the room" };
  if (!room.peers.has(input.to)) return { error: "Target device is offline" };

  const message: SignalMessage = {
    id: randomBytes(6).toString("hex"),
    from: input.from,
    to: input.to,
    kind: input.kind,
    payload: input.payload,
    createdAt: Date.now(),
  };
  room.signals.push(message);
  if (room.signals.length > 200) room.signals = room.signals.slice(-100);

  for (const sub of room.subscribers) {
    if (sub.peerId === input.to) {
      try {
        sub.send({ type: "signal", message });
      } catch {
        room.subscribers.delete(sub);
      }
    }
  }
  return { ok: true };
}
