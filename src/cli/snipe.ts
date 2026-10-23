#!/usr/bin/env node
/**
 * Personal multi-chain sniper CLI.
 * Keys load from a LOCAL file only — never paste keys into a website.
 *
 * Examples:
 *   npm run snipe -- --chain solana --token <mint> --amount 0.05 --wallets ./wallets.txt
 *   npm run snipe -- --chain base --token 0x... --amount 0.02 --wallets ./wallets-evm.txt
 *   npm run snipe -- --chain bsc --token 0x... --amount 0.1 --live
 */
import "dotenv/config";
import { burstBuyEvm } from "../chains/evmSnipe.ts";
import { listChains, resolveChain, rpcFor } from "../chains/registry.ts";
import { burstBuySolana } from "../chains/solanaSnipe.ts";
import { loadEvmWallets, loadSolWallets } from "../wallets/universal.ts";
import { flagBool, flagNumber, flagString, parseArgs } from "./args.ts";

function usage(): never {
  console.log(`Personal sniper (local keys only)

Usage:
  npm run snipe -- --chain <id> --token <address> --amount <native> --wallets <file> [options]

Options:
  --chain       solana|ethereum|base|bsc|arbitrum|polygon|optimism|avalanche
  --token       mint / ERC-20 to buy
  --amount      native amount PER wallet (SOL/ETH/BNB/…)
  --wallets     local file (one private key per line)
  --slippage    bps (default 300 = 3%)
  --live        send txs (default is dry-run quote)
  --dry-run     force quote-only
  --skip-preflight   solana only (default true)
  --max         max wallets to load (default 500)
  --list-chains

Security:
  No browser key upload. Put keys in a local file you control.
`);
  process.exit(1);
}

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (flags["list-chains"] || flags.help || flags.h) {
    if (flags.help || flags.h) usage();
    for (const c of listChains()) {
      console.log(`${c.id.padEnd(12)} ${c.kind.padEnd(7)} ${c.name}`);
    }
    return;
  }

  const chainId = flagString(flags, "chain");
  const token = flagString(flags, "token") || flagString(flags, "mint");
  const walletsFile = flagString(flags, "wallets");
  const amount = flagNumber(flags, "amount", NaN);
  const slippageBps = flagNumber(flags, "slippage", 300);
  const max = flagNumber(flags, "max", 500);
  const live = flagBool(flags, "live", false);
  const dryRunFlag = flagBool(flags, "dry-run", false);
  const dryRun = dryRunFlag || !live;
  const skipPreflight = flagBool(flags, "skip-preflight", true);

  if (!chainId || !token || !walletsFile || !Number.isFinite(amount) || amount <= 0) {
    usage();
  }

  const chain = resolveChain(chainId);
  const rpc = rpcFor(chain);
  console.log(
    JSON.stringify(
      {
        chain: chain.id,
        kind: chain.kind,
        rpc,
        token,
        amount,
        slippageBps,
        dryRun,
        walletsFile,
      },
      null,
      2
    )
  );

  if (chain.kind === "solana") {
    const wallets = loadSolWallets(walletsFile, max);
    if (!wallets.length) throw new Error("No Solana wallets loaded");
    const result = await burstBuySolana({
      rpc,
      wallets,
      mint: token,
      amountSol: amount,
      slippageBps,
      dryRun,
      skipPreflight,
    });
    console.log(JSON.stringify(result, null, 2));
    const fails = result.results.filter((r) => !r.ok).length;
    process.exit(fails ? 2 : 0);
  }

  const wallets = loadEvmWallets(walletsFile, max);
  if (!wallets.length) throw new Error("No EVM wallets loaded");
  const result = await burstBuyEvm({
    chain,
    rpc,
    wallets,
    token,
    amountNative: amount,
    slippageBps,
    dryRun,
  });
  console.log(JSON.stringify(result, null, 2));
  const fails = result.results.filter((r) => !r.ok).length;
  process.exit(fails ? 2 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});