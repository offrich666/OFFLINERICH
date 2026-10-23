import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  type Hex,
} from "viem";
import type { ChainDef } from "./registry.ts";
import type { EvmWallet } from "../wallets/universal.ts";

const LIFI = "https://li.quest/v1";
const NATIVE = "0x0000000000000000000000000000000000000000";

export type EvmSnipeResult = {
  index: number;
  address: string;
  ok: boolean;
  dryRun: boolean;
  ms: number;
  txHash?: string;
  outAmount?: string;
  error?: string;
};

type LifiQuote = {
  estimate?: { toAmount?: string };
  transactionRequest?: {
    to?: string;
    data?: string;
    value?: string;
    gasLimit?: string;
    gasPrice?: string;
  };
};

async function lifiQuote(opts: {
  chainId: number;
  tokenOut: string;
  amountWei: bigint;
  fromAddress: string;
  slippageBps: number;
}): Promise<LifiQuote> {
  const qs = new URLSearchParams({
    fromChain: String(opts.chainId),
    toChain: String(opts.chainId),
    fromToken: NATIVE,
    toToken: opts.tokenOut,
    fromAmount: opts.amountWei.toString(),
    fromAddress: opts.fromAddress,
    slippage: String(opts.slippageBps / 10_000),
  });
  const res = await fetch(`${LIFI}/quote?${qs}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`LiFi quote failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as LifiQuote;
}

export async function burstBuyEvm(opts: {
  chain: ChainDef;
  rpc: string;
  wallets: EvmWallet[];
  token: string;
  amountNative: number;
  slippageBps: number;
  dryRun: boolean;
}): Promise<{
  dryRun: boolean;
  chain: string;
  token: string;
  walletCount: number;
  totalMs: number;
  results: EvmSnipeResult[];
  note: string;
}> {
  const started = performance.now();
  if (!opts.chain.chainId) throw new Error("EVM chain missing chainId");

  const amountWei = parseUnits(String(opts.amountNative), opts.chain.decimals);

  if (opts.dryRun) {
    const account =
      opts.wallets[0]?.address ?? "0x0000000000000000000000000000000000000001";
    const quote = await lifiQuote({
      chainId: opts.chain.chainId,
      tokenOut: opts.token,
      amountWei,
      fromAddress: account,
      slippageBps: opts.slippageBps,
    });
    const out = quote.estimate?.toAmount ?? "(no toAmount)";
    return {
      dryRun: true,
      chain: opts.chain.id,
      token: opts.token,
      walletCount: opts.wallets.length,
      totalMs: Math.round(performance.now() - started),
      results: opts.wallets.map((w) => ({
        index: w.index,
        address: w.address,
        ok: true,
        dryRun: true,
        ms: 0,
        outAmount: String(out),
      })),
      note: "DRY_RUN — LiFi quote only. Parallel live sends are a race, not atomic exclusivity.",
    };
  }

  const publicClient = createPublicClient({
    transport: http(opts.rpc),
  });

  const results = await Promise.all(
    opts.wallets.map(async (w) => {
      const t0 = performance.now();
      try {
        const quote = await lifiQuote({
          chainId: opts.chain.chainId!,
          tokenOut: opts.token,
          amountWei,
          fromAddress: w.address,
          slippageBps: opts.slippageBps,
        });
        const tx = quote.transactionRequest;
        if (!tx?.to || !tx?.data) {
          throw new Error("LiFi response missing transactionRequest");
        }
        const walletClient = createWalletClient({
          account: w.account,
          transport: http(opts.rpc),
        });
        const txHash = await walletClient.sendTransaction({
          account: w.account,
          to: tx.to as Hex,
          data: tx.data as Hex,
          value: BigInt(tx.value || "0"),
          ...(tx.gasPrice ? { gasPrice: BigInt(tx.gasPrice) } : {}),
          ...(tx.gasLimit ? { gas: BigInt(tx.gasLimit) } : {}),
          chain: null,
        });
        void publicClient
          .waitForTransactionReceipt({ hash: txHash })
          .catch(() => undefined);
        return {
          index: w.index,
          address: w.address,
          ok: true,
          dryRun: false,
          ms: Math.round(performance.now() - t0),
          txHash,
          outAmount: quote.estimate?.toAmount,
        } satisfies EvmSnipeResult;
      } catch (err) {
        return {
          index: w.index,
          address: w.address,
          ok: false,
          dryRun: false,
          ms: Math.round(performance.now() - t0),
          error: err instanceof Error ? err.message : String(err),
        } satisfies EvmSnipeResult;
      }
    })
  );

  return {
    dryRun: false,
    chain: opts.chain.id,
    token: opts.token,
    walletCount: opts.wallets.length,
    totalMs: Math.round(performance.now() - started),
    results,
    note: "Parallel EVM sends completed. Not an atomic cross-wallet lock.",
  };
}