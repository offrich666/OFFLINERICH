import assert from "node:assert/strict";
import { test } from "node:test";
import { flagBool, flagNumber, parseArgs } from "./args.ts";

test("parseArgs handles --key value and --flag", () => {
  const { flags } = parseArgs([
    "--chain",
    "base",
    "--live",
    "--amount=0.05",
  ]);
  assert.equal(flags.chain, "base");
  assert.equal(flags.live, true);
  assert.equal(flags.amount, "0.05");
  assert.equal(flagNumber(flags, "amount", 0), 0.05);
  assert.equal(flagBool(flags, "live", false), true);
});