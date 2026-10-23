export type TradeLogEntry = {
  id: string;
  at: string;
  action: "buy" | "sell" | "quote";
  mint: string;
  dryRun: boolean;
  ok: boolean;
  detail: string;
  signature?: string;
};

const MAX = 100;
const entries: TradeLogEntry[] = [];

export function pushLog(entry: Omit<TradeLogEntry, "id" | "at">): TradeLogEntry {
  const full: TradeLogEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
  };
  entries.unshift(full);
  if (entries.length > MAX) entries.length = MAX;
  return full;
}

export function listLogs(): TradeLogEntry[] {
  return [...entries];
}