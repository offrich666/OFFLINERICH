import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { loadWalletsFromFile, mergePrimaryAndFile } from "./walletsFile.ts";

function tmpFile(contents: string): string {
  const p = path.join(
    os.tmpdir(),
    `wallets-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`
  );
  fs.writeFileSync(p, contents);
  return p;
}

test("loads many base58 keys from file and skips comments", () => {
  const keys = Array.from({ length: 12 }, () =>
    bs58.encode(Keypair.generate().secretKey)
  );
  const file = tmpFile(`# comment\n\n${keys.join("\n")}\n`);
  const loaded = loadWalletsFromFile(file, 300);
  assert.equal(loaded.length, 12);
  assert.equal(loaded[0]?.index, 0);
});

test("rejects over MAX_WALLETS", () => {
  const keys = Array.from({ length: 5 }, () =>
    bs58.encode(Keypair.generate().secretKey)
  );
  const file = tmpFile(keys.join("\n"));
  assert.throws(() => loadWalletsFromFile(file, 3), /MAX_WALLETS/);
});

test("mergePrimaryAndFile dedupes PRIVATE_KEY with file", () => {
  const kp = Keypair.generate();
  const secret = bs58.encode(kp.secretKey);
  const file = tmpFile(`${secret}\n${bs58.encode(Keypair.generate().secretKey)}`);
  const merged = mergePrimaryAndFile({
    privateKey: secret,
    walletsFile: file,
    maxWallets: 300,
  });
  assert.equal(merged.length, 2);
});