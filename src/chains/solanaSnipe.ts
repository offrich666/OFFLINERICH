import { Connection } from "@solana/web3.js";
import { burstBuy } from "../burst.ts";
import type { SolWallet } from "../wallets/universal.ts";
import type { LoadedWallet } from "../walletsFile.ts";

export async function burstBuySolana(opts: {
  rpc: string;
  wallets: SolWallet[];
  mint: string;
  amountSol: number;
  slippageBps: number;
  dryRun: boolean;
  skipPreflight: boolean;
}) {
  const connection = new Connection(opts.rpc, "confirmed");
  const mapped: LoadedWallet[] = opts.wallets.map((w) => ({
    index: w.index,
    keypair: w.keypair,
    publicKey: w.address,
  }));
  return burstBuy({
    connection,
    wallets: mapped,
    mint: opts.mint,
    solAmount: opts.amountSol,
    slippageBps: opts.slippageBps,
    dryRun: opts.dryRun,
    skipPreflight: opts.skipPreflight,
  });
}