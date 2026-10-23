import fs from "node:fs";
import path from "node:path";
import { Keypair } from "@solana/web3.js";
import { keypairFromSecret } from "./wallet.ts";

export type LoadedWallet = {
  index: number;
  keypair: Keypair;
  publicKey: string;
};

/**
 * Load wallets from a local file only (never from HTTP).
 * Formats:
 * - one base58 secret per line
 * - JSON array of base58 strings or byte arrays
 * Lines starting with # are ignored.
 */
export function loadWalletsFromFile(
  filePath: string,
  maxWallets: number
): LoadedWallet[] {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`WALLETS_FILE not found: ${abs}`);
  }

  const raw = fs.readFileSync(abs, "utf8").trim();
  if (!raw) return [];

  const secrets: string[] = [];

  if (raw.startsWith("[")) {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("WALLETS_FILE JSON must be an array");
    }
    for (const item of parsed) {
      if (typeof item === "string") secrets.push(item);
      else if (Array.isArray(item)) secrets.push(JSON.stringify(item));
      else if (item && typeof item === "object" && "secret" in item) {
        secrets.push(String((item as { secret: unknown }).secret));
      }
    }
  } else {
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      secrets.push(t);
    }
  }

  if (secrets.length > maxWallets) {
    throw new Error(
      `WALLETS_FILE has ${secrets.length} keys; MAX_WALLETS=${maxWallets}`
    );
  }

  const seen = new Set<string>();
  const out: LoadedWallet[] = [];

  for (let i = 0; i < secrets.length; i++) {
    const kp = keypairFromSecret(secrets[i]!);
    const pk = kp.publicKey.toBase58();
    if (seen.has(pk)) continue;
    seen.add(pk);
    out.push({ index: out.length, keypair: kp, publicKey: pk });
  }

  return out;
}

export function mergePrimaryAndFile(opts: {
  privateKey?: string;
  walletsFile?: string;
  maxWallets: number;
}): LoadedWallet[] {
  const list: LoadedWallet[] = [];
  const seen = new Set<string>();

  const push = (kp: Keypair) => {
    const pk = kp.publicKey.toBase58();
    if (seen.has(pk)) return;
    seen.add(pk);
    list.push({ index: list.length, keypair: kp, publicKey: pk });
  };

  if (opts.privateKey?.trim()) {
    push(keypairFromSecret(opts.privateKey));
  }

  if (opts.walletsFile?.trim()) {
    for (const w of loadWalletsFromFile(opts.walletsFile, opts.maxWallets)) {
      push(w.keypair);
    }
  }

  // reindex after dedupe
  return list.map((w, index) => ({ ...w, index }));
}