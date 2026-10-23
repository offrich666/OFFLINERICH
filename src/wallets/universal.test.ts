import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import {
  importWalletsToFile,
  loadEvmWallets,
  loadSolWallets,
} from "./universal.ts";

function tmp(contents: string): string {
  const p = path.join(
    os.tmpdir(),
    `w-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`
  );
  fs.writeFileSync(p, contents);
  return p;
}

test("loadSolWallets reads base58 keys", () => {
  const k = bs58.encode(Keypair.generate().secretKey);
  const file = tmp(`${k}\n`);
  const wallets = loadSolWallets(file);
  assert.equal(wallets.length, 1);
  assert.equal(wallets[0]?.kind, "solana");
});

test("loadEvmWallets reads hex keys", () => {
  const pk = generatePrivateKey();
  const file = tmp(`${pk}\n`);
  const wallets = loadEvmWallets(file);
  assert.equal(wallets.length, 1);
  assert.equal(wallets[0]?.address, privateKeyToAccount(pk).address);
});

test("importWalletsToFile merges without dupes", () => {
  const a = generatePrivateKey();
  const b = generatePrivateKey();
  const from = tmp(`${a}\n${b}\n`);
  const to = tmp(`${a}\n`);
  const result = importWalletsToFile({ from, to });
  assert.equal(result.added, 1);
  assert.equal(result.total, 2);
});

test("rejects EVM key in Solana file", () => {
  const file = tmp(`${generatePrivateKey()}\n`);
  assert.throws(() => loadSolWallets(file), /EVM/);
});