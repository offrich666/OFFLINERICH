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
  solAmount?: number;
  signature?: string;
  error?: string;
  outAmount?: string;
};

export type BurstResult = {
  dryRun: boolean;
  mint: string;
  solAmount: number | null;
  solAmountMin?: number;
  solAmountMax?: number;
  randomAmounts: boolean;
  walletCount: number;
  totalMs: number;
  quote?: QuoteResponse;
  results: BurstWalletResult[];
  note: string;
};

function randomSol(min: number, max: number): number {
  if (max < min) [min, max] = [max, min];
  const v = min + Math.random() * (max - min);
  // 4 decimal places is enough for SOL sizing
  return Math.round(v * 10_000) / 10_000;
}

/**
 * Fire buys across many wallets as fast as practical.
 * Parallel race — NOT an atomic bundle.
 */
export async function burstBuy(opts: {
  connection: Connection;
  wallets: LoadedWallet[];
  mint: string;
  solAmount?: number;
  solAmountMin?: number;
  solAmountMax?: number;
  slippageBps: number;
  dryRun: boolean;
  skipPreflight: boolean;
}): Promise<BurstResult> {
  const started = performance.now();
  const random =
    Number.isFinite(opts.solAmountMin) &&
    Number.isFinite(opts.solAmountMax) &&
    (opts.solAmountMin as number) > 0 &&
    (opts.solAmountMax as number) > 0;

  const amounts = opts.wallets.map(() => {
    if (random) {
      return randomSol(opts.solAmountMin as number, opts.solAmountMax as number);
    }
    return Number(opts.solAmount);
  });

  if (opts.dryRun) {
    // One quote at the mid/fixed size for preview speed
    const preview =
      random
        ? (amounts.reduce((a, b) => a + b, 0) / amounts.length)
        : amounts[0]!;
    const quote = await getQuote({
      inputMint: SOL_MINT,
      outputMint: opts.mint,
      amount: Math.round(preview * LAMPORTS_PER_SOL),
      slippageBps: opts.slippageBps,
    });
    const results: BurstWalletResult[] = opts.wallets.map((w, i) => ({
      index: w.index,
      publicKey: w.publicKey,
      ok: true,
      dryRun: true,
      ms: 0,
      solAmount: amounts[i],
      outAmount: quote.outAmount,
    }));
    return {
      dryRun: true,
      mint: opts.mint,
      solAmount: random ? null : amounts[0]!,
      solAmountMin: random ? opts.solAmountMin : undefined,
      solAmountMax: random ? opts.solAmountMax : undefined,
      randomAmounts: random,
      walletCount: opts.wallets.length,
      totalMs: Math.round(performance.now() - started),
      quote,
      results,
      note: random
        ? "DRY_RUN — random SOL per wallet planned; live mode quotes+sends each wallet in parallel."
        : "DRY_RUN — shared quote preview. Parallel live sends are a race, not an atomic lock.",
    };
  }

  // Live: each wallet gets its own quote (needed when amounts differ) then fires in parallel.
  const results = await Promise.all(
    opts.wallets.map(async (w, i) => {
      const solAmount = amounts[i]!;
      const t0 = performance.now();
      try {
        const quote = await getQuote({
          inputMint: SOL_MINT,
          outputMint: opts.mint,
          amount: Math.round(solAmount * LAMPORTS_PER_SOL),
          slippageBps: opts.slippageBps,
        });
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
          solAmount,
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
          solAmount,
          error: err instanceof Error ? err.message : String(err),
        } satisfies BurstWalletResult;
      }
    })
  );

  return {
    dryRun: false,
    mint: opts.mint,
    solAmount: random ? null : amounts[0]!,
    solAmountMin: random ? opts.solAmountMin : undefined,
    solAmountMax: random ? opts.solAmountMax : undefined,
    randomAmounts: random,
    walletCount: opts.wallets.length,
    totalMs: Math.round(performance.now() - started),
    results,
    note:
      "Parallel quote+send completed. Race only — not exclusive entry for all wallets.",
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