export type FlagMap = Record<string, string | boolean>;

/** Minimal argv parser: --key value | --flag | --key=value */
export function parseArgs(argv: string[]): { _: string[]; flags: FlagMap } {
  const flags: FlagMap = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const body = a.slice(2);
      if (body.includes("=")) {
        const [k, ...rest] = body.split("=");
        flags[k!] = rest.join("=");
        continue;
      }
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        flags[body] = true;
      } else {
        flags[body] = next;
        i++;
      }
      continue;
    }
    positional.push(a);
  }
  return { _: positional, flags };
}

export function flagString(flags: FlagMap, name: string, fallback = ""): string {
  const v = flags[name];
  if (typeof v === "string") return v;
  return fallback;
}

export function flagBool(flags: FlagMap, name: string, fallback = false): boolean {
  const v = flags[name];
  if (v === undefined) return fallback;
  if (v === true) return true;
  if (v === false) return false;
  const s = String(v).toLowerCase();
  if (["1", "true", "yes", "on"].includes(s)) return true;
  if (["0", "false", "no", "off"].includes(s)) return false;
  return fallback;
}

export function flagNumber(flags: FlagMap, name: string, fallback: number): number {
  const v = flagString(flags, name, "");
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`--${name} must be a number`);
  return n;
}