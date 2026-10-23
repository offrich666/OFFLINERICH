import assert from "node:assert/strict";
import { test } from "node:test";
import { assertKeyPresent, loadConfig } from "./config.ts";

test("DRY_RUN defaults to true", () => {
  const cfg = loadConfig({
    RPC_URL: "https://api.mainnet-beta.solana.com",
  } as NodeJS.ProcessEnv);
  assert.equal(cfg.DRY_RUN, true);
  assert.equal(cfg.MAX_BUY_SOL, 0.1);
});

test("DRY_RUN=false enables live mode", () => {
  const cfg = loadConfig({
    RPC_URL: "https://api.mainnet-beta.solana.com",
    DRY_RUN: "false",
    MAX_BUY_SOL: "0.25",
  } as NodeJS.ProcessEnv);
  assert.equal(cfg.DRY_RUN, false);
  assert.equal(cfg.MAX_BUY_SOL, 0.25);
});

test("assertKeyPresent rejects empty key", () => {
  const cfg = loadConfig({
    RPC_URL: "https://api.mainnet-beta.solana.com",
  } as NodeJS.ProcessEnv);
  assert.throws(() => assertKeyPresent(cfg), /PRIVATE_KEY/);
});