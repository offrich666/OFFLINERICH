import os from "node:os";

/** Non-internal IPv4 addresses useful for phone-on-same-Wi‑Fi access. */
export function lanIPv4Addresses(): string[] {
  const out: string[] = [];
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    if (!list) continue;
    for (const info of list) {
      if (info.family !== "IPv4") continue;
      if (info.internal) continue;
      out.push(info.address);
    }
  }
  return out;
}