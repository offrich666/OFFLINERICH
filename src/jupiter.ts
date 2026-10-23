import {
  Connection,
  Keypair,
  VersionedTransaction,
} from "@solana/web3.js";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const JUPITER_BASE = "https://lite-api.jup.ag/swap/v1";

export type QuoteResponse = {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  slippageBps: number;
  routePlan?: unknown[];
};

export type SwapResult = {
  dryRun: boolean;
  signature?: string;
  quote: QuoteResponse;
  message: string;
};

async function jupiterFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${JUPITER_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  return res;
}

export async function getQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: number; // raw atomic units
  slippageBps: number;
}): Promise<QuoteResponse> {
  const qs = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: String(params.amount),
    slippageBps: String(params.slippageBps),
  });

  const res = await jupiterFetch(`/quote?${qs}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jupiter quote failed (${res.status}): ${text}`);
  }
  return (await res.json()) as QuoteResponse;
}

export async function buyWithSol(opts: {
  connection: Connection;
  wallet: Keypair;
  outputMint: string;
  solLamports: number;
  slippageBps: number;
  dryRun: boolean;
}): Promise<SwapResult> {
  const quote = await getQuote({
    inputMint: SOL_MINT,
    outputMint: opts.outputMint,
    amount: opts.solLamports,
    slippageBps: opts.slippageBps,
  });

  if (opts.dryRun) {
    return {
      dryRun: true,
      quote,
      message:
        "DRY_RUN=true — quote only. Set DRY_RUN=false in .env to send a real swap.",
    };
  }

  return executeSwap({
    connection: opts.connection,
    wallet: opts.wallet,
    quote,
  });
}

export async function sellTokenForSol(opts: {
  connection: Connection;
  wallet: Keypair;
  inputMint: string;
  rawAmount: number;
  slippageBps: number;
  dryRun: boolean;
}): Promise<SwapResult> {
  const quote = await getQuote({
    inputMint: opts.inputMint,
    outputMint: SOL_MINT,
    amount: opts.rawAmount,
    slippageBps: opts.slippageBps,
  });

  if (opts.dryRun) {
    return {
      dryRun: true,
      quote,
      message:
        "DRY_RUN=true — quote only. Set DRY_RUN=false in .env to send a real swap.",
    };
  }

  return executeSwap({
    connection: opts.connection,
    wallet: opts.wallet,
    quote,
  });
}

async function executeSwap(opts: {
  connection: Connection;
  wallet: Keypair;
  quote: QuoteResponse;
}): Promise<SwapResult> {
  const res = await jupiterFetch("/swap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: opts.quote,
      userPublicKey: opts.wallet.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: "auto",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jupiter swap build failed (${res.status}): ${text}`);
  }

  const { swapTransaction } = (await res.json()) as { swapTransaction: string };
  const tx = VersionedTransaction.deserialize(
    Buffer.from(swapTransaction, "base64")
  );
  tx.sign([opts.wallet]);

  const signature = await opts.connection.sendTransaction(tx, {
    skipPreflight: false,
    maxRetries: 3,
  });
  await opts.connection.confirmTransaction(signature, "confirmed");

  return {
    dryRun: false,
    signature,
    quote: opts.quote,
    message: `Swap submitted: ${signature}`,
  };
}

/** Build + send without waiting for confirmation (burst path). */
export async function sendSwapFast(opts: {
  connection: Connection;
  wallet: Keypair;
  quote: QuoteResponse;
  skipPreflight: boolean;
}): Promise<{ signature: string; quote: QuoteResponse }> {
  const res = await jupiterFetch("/swap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: opts.quote,
      userPublicKey: opts.wallet.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: "auto",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jupiter swap build failed (${res.status}): ${text}`);
  }

  const { swapTransaction } = (await res.json()) as { swapTransaction: string };
  const tx = VersionedTransaction.deserialize(
    Buffer.from(swapTransaction, "base64")
  );
  tx.sign([opts.wallet]);

  const signature = await opts.connection.sendTransaction(tx, {
    skipPreflight: opts.skipPreflight,
    maxRetries: 0,
  });

  return { signature, quote: opts.quote };
}

export { SOL_MINT };