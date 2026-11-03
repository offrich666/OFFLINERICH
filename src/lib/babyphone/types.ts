export type DeviceRole = "camera" | "remoter";

export type PeerInfo = {
  id: string;
  name: string;
  role: DeviceRole;
  joinedAt: number;
};

export type SignalMessage = {
  id: string;
  from: string;
  to: string;
  kind: "offer" | "answer" | "ice";
  payload: unknown;
  createdAt: number;
};

export type RoomEvent =
  | { type: "hello"; peerId: string; roomId: string; peers: PeerInfo[] }
  | { type: "peers"; peers: PeerInfo[] }
  | { type: "signal"; message: SignalMessage }
  | { type: "error"; message: string };
