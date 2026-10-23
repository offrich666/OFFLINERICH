#!/usr/bin/env node
/**
 * Local-only wallet import: merge keys from one file into another.
 * This is the personal “upload” path — never send keys over HTTP.
 *
 *   npm run wallets:import -- --from ./new-keys.txt --to ./wallets.txt
 */
import { importWalletsToFile } from "../wallets/universal.ts";
import { flagString, parseArgs } from "./args.ts";

function usage(): never {
  console.log(`Local wallet import (disk only)

  npm run wallets:import -- --from ./incoming.txt --to ./wallets.txt

Incoming file: one private key per line (# comments ok).
Refuses browser / HTTP upload by design.
`);
  process.exit(1);
}

const { flags } = parseArgs(process.argv.slice(2));
const from = flagString(flags, "from");
const to = flagString(flags, "to");
if (!from || !to || flags.help) usage();

const result = importWalletsToFile({ from, to });
console.log(JSON.stringify(result, null, 2));