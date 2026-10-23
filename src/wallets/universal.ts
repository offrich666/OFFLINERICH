import fs from "node:fs";
import path from "node:path";
import { Keypair } from "@solana/web3.js";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { keypairFromSecret } from "../wallet.ts";

export type SolWallet = {
  kind: "solana";
  index: number;
  address: string;
  keypair: Keypair;
};

export type EvmWallet = {
  kind: "evm";
  index: number;
  address: string;
  account: PrivateKeyAccount;
  privateKey: `0x${string}`;
};

export type AnyWallet = SolWallet | EvmWallet;

function readSecrets(filePath: string): string[] {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Wallets file not found: ${abs}`);
  }
  const raw = fs.readFileSync(abs, "utf8").trim();
  if (!raw) return [];

  if (raw.startsWith("[")) {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error("JSON wallets file must be an array");
    return parsed.map((item) => {
      if (typeof item === "string") return item;
      if (Array.isArray(item)) return JSON.stringify(item);
      if (item && typeof item === "object" && "secret" in item) {
        return String((item as { secret: unknown }).secret);
      }
      throw new Error("Unsupported wallet JSON entry");
    });
  }

  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

function looksEvm(secret: string): boolean {
  const s = secret.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(s)) return true;
  if (/^[0-9a-fA-F]{64}$/.test(s)) return true;
  return false;
}

function normalizeEvmKey(secret: string): `0x${string}` {
  const s = secret.trim();
  return (s.startsWith("0x") ? s : `0x${s}`) as `0x${string}`;
}

/** Load Solana base58 (or JSON byte-array) secrets from a local file. */
export function loadSolWallets(filePath: string, max = 500): SolWallet[] {
  const secrets = readSecrets(filePath);
  if (secrets.length > max) {
    throw new Error(`Too many wallets (${secrets.length}); max=${max}`);
  }
  const seen = new Set<string>();
  const out: SolWallet[] = [];
  for (const secret of secrets) {
    if (looksEvm(secret)) {
      throw new Error(
        "EVM hex key found in Solana wallets file. Use a separate file for EVM keys."
      );
    }
    const keypair = keypairFromSecret(secret);
    const address = keypair.publicKey.toBase58();
    if (seen.has(address)) continue;
    seen.add(address);
    out.push({ kind: "solana", index: out.length, address, keypair });
  }
  return out;
}

/** Load EVM hex private keys from a local file (0x… or 64 hex). */
export function loadEvmWallets(filePath: string, max = 500): EvmWallet[] {
  const secrets = readSecrets(filePath);
  if (secrets.length > max) {
    throw new Error(`Too many wallets (${secrets.length}); max=${max}`);
  }
  const seen = new Set<string>();
  const out: EvmWallet[] = [];
  for (const secret of secrets) {
    if (!looksEvm(secret)) {
      throw new Error(
        "Non-EVM key found in EVM wallets file. Use hex private keys (0x…)."
      );
    }
    const privateKey = normalizeEvmKey(secret);
    const account = privateKeyToAccount(privateKey);
    const address = account.address;
    if (seen.has(address.toLowerCase())) continue;
    seen.add(address.toLowerCase());
    out.push({ kind: "evm", index: out.length, address, account, privateKey });
  }
  return out;
}

/**
 * Append secrets from an input file into an output wallets file (local disk only).
 */
export function importWalletsToFile(opts: {
  from: string;
  to: string;
}): { added: number; total: number; to: string } {
  const incoming = readSecrets(opts.from);
  return appendSecretsToFile({ secrets: incoming, to: opts.to });
}

/** Append one or more secrets (already parsed) into a local wallets file. */
export function appendSecretsToFile(opts: {
  secrets: string[];
  to: string;
}): { added: number; total: number; to: string } {
  const absTo = path.resolve(opts.to);
  const existing = fs.existsSync(absTo) ? readSecrets(absTo) : [];
  const set = new Set(existing.map((s) => s.trim()));
  let added = 0;
  for (const raw of opts.secrets) {
    const s = raw.trim();
    if (!s || s.startsWith("#")) continue;
    if (set.has(s)) continue;
    set.add(s);
    existing.push(s);
    added++;
  }
  const header =
    "# Personal wallets file — keep on this PC only\n";
  fs.writeFileSync(absTo, header + existing.join("\n") + "\n", "utf8");
  return { added, total: existing.length, to: absTo };
}

export function parseSecretLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}