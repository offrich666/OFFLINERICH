import assert from "node:assert/strict";
import { test } from "node:test";
import { assertAnyWalletSource, loadConfig } from "./config.ts";

test("DRY_RUN defaults to true", () => {
  const cfg = loadConfig({
    RPC_URL: "https://api.mainnet-beta.solana.com",
    HOST: "127.0.0.1",
  } as NodeJS.ProcessEnv);
  assert.equal(cfg.DRY_RUN, true);
  assert.equal(cfg.MAX_BUY_SOL, 0.1);
  assert.equal(cfg.MAX_WALLETS, 500);
  assert.equal(cfg.accessToken, "");
  assert.equal(cfg.tokenGenerated, false);
});

test("non-loopback host auto-generates ACCESS_TOKEN", () => {
  const cfg = loadConfig({
    RPC_URL: "https://api.mainnet-beta.solana.com",
    HOST: "0.0.0.0",
  } as NodeJS.ProcessEnv);
  assert.ok(cfg.accessToken.length > 10);
  assert.equal(cfg.tokenGenerated, true);
});

test("explicit ACCESS_TOKEN is kept", () => {
  const cfg = loadConfig({
    RPC_URL: "https://api.mainnet-beta.solana.com",
    HOST: "0.0.0.0",
    ACCESS_TOKEN: "phone-secret",
  } as NodeJS.ProcessEnv);
  assert.equal(cfg.accessToken, "phone-secret");
  assert.equal(cfg.tokenGenerated, false);
});

test("assertAnyWalletSource rejects empty sources", () => {
  const cfg = loadConfig({
    RPC_URL: "https://api.mainnet-beta.solana.com",
    HOST: "127.0.0.1",
  } as NodeJS.ProcessEnv);
  assert.throws(() => assertAnyWalletSource(cfg), /PRIVATE_KEY|WALLETS_FILE/);
});