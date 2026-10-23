import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  buyWithSol,
  getQuote,
  sendSwapFast,
  SOL_MINT,
  type QuoteResponse,
} from "./jupiter.ts";
import type { LoadedWallet } from "./walletsFile.ts";

export type BurstWalletResult = {
  index: number;
  publicKey: string;
  ok: boolean;
  dryRun: boolean;
  ms: number;
  signature?: string;
  error?: string;
  outAmount?: string;
};

export type BurstResult = {
  dryRun: boolean;
  mint: string;
  solAmount: number;
  walletCount: number;
  totalMs: number;
  quote?: QuoteResponse;
  results: BurstWalletResult[];
  note: string;
};

/**
 * Fire buys across many wallets as fast as practical.
 * This is a race (parallel sends), NOT an atomic bundle — other txs can still
 * land between yours. Jito bundles are typically a handful of txs, not 300.
 */
export async function burstBuy(opts: {
  connection: Connection;
  wallets: LoadedWallet[];
  mint: string;
  solAmount: number;
  slippageBps: number;
  dryRun: boolean;
  skipPreflight: boolean;
}): Promise<BurstResult> {
  const started = performance.now();
  const lamports = Math.round(opts.solAmount * LAMPORTS_PER_SOL);

  const quote = await getQuote({
    inputMint: SOL_MINT,
    outputMint: opts.mint,
    amount: lamports,
    slippageBps: opts.slippageBps,
  });

  if (opts.dryRun) {
    const results: BurstWalletResult[] = opts.wallets.map((w) => ({
      index: w.index,
      publicKey: w.publicKey,
      ok: true,
      dryRun: true,
      ms: 0,
      outAmount: quote.outAmount,
    }));
    return {
      dryRun: true,
      mint: opts.mint,
      solAmount: opts.solAmount,
      walletCount: opts.wallets.length,
      totalMs: Math.round(performance.now() - started),
      quote,
      results,
      note:
        "DRY_RUN — one shared quote simulated across selected wallets. Parallel live sends are a race, not an atomic lock on the pool.",
    };
  }

  const results = await Promise.all(
    opts.wallets.map(async (w) => {
      const t0 = performance.now();
      try {
        const sent = await sendSwapFast({
          connection: opts.connection,
          wallet: w.keypair,
          quote,
          skipPreflight: opts.skipPreflight,
        });
        return {
          index: w.index,
          publicKey: w.publicKey,
          ok: true,
          dryRun: false,
          ms: Math.round(performance.now() - t0),
          signature: sent.signature,
          outAmount: quote.outAmount,
        } satisfies BurstWalletResult;
      } catch (err) {
        return {
          index: w.index,
          publicKey: w.publicKey,
          ok: false,
          dryRun: false,
          ms: Math.round(performance.now() - t0),
          error: err instanceof Error ? err.message : String(err),
        } satisfies BurstWalletResult;
      }
    })
  );

  return {
    dryRun: false,
    mint: opts.mint,
    solAmount: opts.solAmount,
    walletCount: opts.wallets.length,
    totalMs: Math.round(performance.now() - started),
    quote,
    results,
    note:
      "Parallel send completed. This does not guarantee the same slot or that nobody else landed between your entries.",
  };
}

export async function singleBuyCompat(opts: {
  connection: Connection;
  wallet: Keypair;
  mint: string;
  solAmount: number;
  slippageBps: number;
  dryRun: boolean;
}) {
  return buyWithSol({
    connection: opts.connection,
    wallet: opts.wallet,
    outputMint: opts.mint,
    solLamports: Math.round(opts.solAmount * LAMPORTS_PER_SOL),
    slippageBps: opts.slippageBps,
    dryRun: opts.dryRun,
  });
}