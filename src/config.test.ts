import assert from "node:assert/strict";
import { test } from "node:test";
import { assertAnyWalletSource, loadConfig } from "./config.ts";

test("DRY_RUN defaults to true", () => {
  const cfg = loadConfig({
    RPC_URL: "https://api.mainnet-beta.solana.com",
  } as NodeJS.ProcessEnv);
  assert.equal(cfg.DRY_RUN, true);
  assert.equal(cfg.MAX_BUY_SOL, 0.1);
  assert.equal(cfg.MAX_WALLETS, 500);
});

test("DRY_RUN=false enables live mode", () => {
  const cfg = loadConfig({
    RPC_URL: "https://api.mainnet-beta.solana.com",
    DRY_RUN: "false",
    MAX_BUY_SOL: "0.25",
    MAX_WALLETS: "300",
  } as NodeJS.ProcessEnv);
  assert.equal(cfg.DRY_RUN, false);
  assert.equal(cfg.MAX_BUY_SOL, 0.25);
  assert.equal(cfg.MAX_WALLETS, 300);
});

test("assertAnyWalletSource rejects empty sources", () => {
  const cfg = loadConfig({
    RPC_URL: "https://api.mainnet-beta.solana.com",
  } as NodeJS.ProcessEnv);
  assert.throws(() => assertAnyWalletSource(cfg), /PRIVATE_KEY|WALLETS_FILE/);
});