import type { DeviceRole } from "@/lib/babyphone/types";

/** Stable PeerJS ids so camera + remoter find each other from any network. */
export function peerJsId(roomId: string, role: DeviceRole): string {
  const room = roomId.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  const suffix = role === "camera" ? "cam" : "rem";
  return `orcrib${room}${suffix}`;
}

export function counterpartRole(role: DeviceRole): DeviceRole {
  return role === "camera" ? "remoter" : "camera";
}

export function makeRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes =
    typeof crypto !== "undefined" && "getRandomValues" in crypto
      ? crypto.getRandomValues(new Uint8Array(4))
      : Uint8Array.from([
          Math.floor(Math.random() * 256),
          Math.floor(Math.random() * 256),
          Math.floor(Math.random() * 256),
          Math.floor(Math.random() * 256),
        ]);
  for (let i = 0; i < 4; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}
