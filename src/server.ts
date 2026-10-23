import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { burstBuy } from "./burst.ts";
import { assertAnyWalletSource, loadConfig } from "./config.ts";
import { buyWithSol, sellTokenForSol } from "./jupiter.ts";
import { listLogs, pushLog } from "./tradeLog.ts";
import { getSolBalance, truncateAddress } from "./wallet.ts";
import { mergePrimaryAndFile, type LoadedWallet } from "./walletsFile.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfg = loadConfig();
assertAnyWalletSource(cfg);

const walletBank: LoadedWallet[] = mergePrimaryAndFile({
  privateKey: cfg.PRIVATE_KEY,
  walletsFile: cfg.WALLETS_FILE,
  maxWallets: cfg.MAX_WALLETS,
});

if (walletBank.length === 0) {
  throw new Error("No wallets loaded. Check PRIVATE_KEY / WALLETS_FILE.");
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "64kb" }));

// Hard rule: this API never accepts private keys from the browser.
app.post("/api/import-key", (_req, res) => {
  res.status(403).json({
    error:
      "Refused. Bulk private keys are not accepted over HTTP. Put keys in a local WALLETS_FILE (one per line). Browser “instant import” UIs are a common drain vector.",
  });
});
app.post("/api/import-keys", (_req, res) => {
  res.status(403).json({
    error:
      "Refused. Use local WALLETS_FILE on disk only — never paste hundreds of keys into a webpage.",
  });
});

function connection() {
  return new Connection(cfg.RPC_URL, "confirmed");
}

function pickWallets(indices: unknown): LoadedWallet[] {
  if (!Array.isArray(indices) || indices.length === 0) {
    return [...walletBank];
  }
  const picked: LoadedWallet[] = [];
  const seen = new Set<number>();
  for (const raw of indices) {
    const i = Number(raw);
    if (!Number.isInteger(i) || i < 0 || i >= walletBank.length) {
      throw new Error(`Invalid wallet index: ${raw}`);
    }
    if (seen.has(i)) continue;
    seen.add(i);
    picked.push(walletBank[i]!);
  }
  if (picked.length === 0) throw new Error("No wallets selected");
  return picked;
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    dryRun: cfg.DRY_RUN,
    maxBuySol: cfg.MAX_BUY_SOL,
    maxWallets: cfg.MAX_WALLETS,
    loadedWallets: walletBank.length,
    skipPreflight: cfg.SKIP_PREFLIGHT,
    rpc: cfg.RPC_URL,
    note: "Personal local trader. Keys from disk only. Parallel burst ≠ atomic exclusivity.",
  });
});

app.get("/api/wallets", async (_req, res) => {
  try {
    const conn = connection();
    const balances = await Promise.all(
      walletBank.map(async (w) => {
        try {
          const bal = await getSolBalance(conn, w.keypair.publicKey);
          return bal;
        } catch {
          return null;
        }
      })
    );
    let slot: number | null = null;
    try {
      slot = await conn.getSlot("confirmed");
    } catch {
      slot = null;
    }
    const totalSol = balances.reduce<number>(
      (sum, b) => sum + (typeof b === "number" ? b : 0),
      0
    );
    res.json({
      count: walletBank.length,
      dryRun: cfg.DRY_RUN,
      maxBuySol: cfg.MAX_BUY_SOL,
      rpcConnected: slot !== null,
      slot,
      totalSol,
      wallets: walletBank.map((w, i) => ({
        index: w.index,
        publicKey: w.publicKey,
        truncated: truncateAddress(w.publicKey),
        balanceSol: balances[i],
      })),
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** Back-compat single-wallet summary (wallet 0). */
app.get("/api/wallet", async (_req, res) => {
  try {
    const w = walletBank[0]!;
    const conn = connection();
    const balance = await getSolBalance(conn, w.keypair.publicKey);
    let slot: number | null = null;
    try {
      slot = await conn.getSlot("confirmed");
    } catch {
      slot = null;
    }
    res.json({
      publicKey: w.publicKey,
      truncated: truncateAddress(w.publicKey),
      balanceSol: balance,
      dryRun: cfg.DRY_RUN,
      maxBuySol: cfg.MAX_BUY_SOL,
      loadedWallets: walletBank.length,
      rpcConnected: slot !== null,
      slot,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/buy", async (req, res) => {
  try {
    const mint = String(req.body?.mint ?? "").trim();
    const solAmount = Number(req.body?.solAmount);
    const slippageBps = Number(req.body?.slippageBps ?? 300);
    const walletIndex = Number(req.body?.walletIndex ?? 0);

    if (!mint) throw new Error("mint is required");
    new PublicKey(mint);
    if (!Number.isFinite(solAmount) || solAmount <= 0) {
      throw new Error("solAmount must be a positive number");
    }
    if (solAmount > cfg.MAX_BUY_SOL) {
      throw new Error(
        `solAmount ${solAmount} exceeds MAX_BUY_SOL=${cfg.MAX_BUY_SOL}`
      );
    }
    if (!Number.isInteger(walletIndex) || !walletBank[walletIndex]) {
      throw new Error("walletIndex out of range");
    }

    const wallet = walletBank[walletIndex]!;
    const result = await buyWithSol({
      connection: connection(),
      wallet: wallet.keypair,
      outputMint: mint,
      solLamports: Math.round(solAmount * LAMPORTS_PER_SOL),
      slippageBps: Math.floor(slippageBps),
      dryRun: cfg.DRY_RUN,
    });

    pushLog({
      action: cfg.DRY_RUN ? "quote" : "buy",
      mint,
      dryRun: result.dryRun,
      ok: true,
      detail: `${result.message} · wallet ${walletIndex}`,
      signature: result.signature,
    });

    res.json(result);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    pushLog({
      action: "buy",
      mint: String(req.body?.mint ?? ""),
      dryRun: cfg.DRY_RUN,
      ok: false,
      detail,
    });
    res.status(400).json({ error: detail });
  }
});

app.post("/api/burst-buy", async (req, res) => {
  try {
    const mint = String(req.body?.mint ?? "").trim();
    const solAmount = Number(req.body?.solAmount);
    const slippageBps = Number(req.body?.slippageBps ?? 300);
    const wallets = pickWallets(req.body?.walletIndices);

    if (!mint) throw new Error("mint is required");
    new PublicKey(mint);
    if (!Number.isFinite(solAmount) || solAmount <= 0) {
      throw new Error("solAmount must be a positive number");
    }
    if (solAmount > cfg.MAX_BUY_SOL) {
      throw new Error(
        `solAmount ${solAmount} exceeds MAX_BUY_SOL=${cfg.MAX_BUY_SOL}`
      );
    }

    const result = await burstBuy({
      connection: connection(),
      wallets,
      mint,
      solAmount,
      slippageBps: Math.floor(slippageBps),
      dryRun: cfg.DRY_RUN,
      skipPreflight: cfg.SKIP_PREFLIGHT,
    });

    const okCount = result.results.filter((r) => r.ok).length;
    pushLog({
      action: cfg.DRY_RUN ? "quote" : "buy",
      mint,
      dryRun: result.dryRun,
      ok: okCount > 0,
      detail: `burst ${okCount}/${result.walletCount} in ${result.totalMs}ms`,
    });

    res.json(result);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    pushLog({
      action: "buy",
      mint: String(req.body?.mint ?? ""),
      dryRun: cfg.DRY_RUN,
      ok: false,
      detail,
    });
    res.status(400).json({ error: detail });
  }
});

app.post("/api/sell", async (req, res) => {
  try {
    const mint = String(req.body?.mint ?? "").trim();
    const rawAmount = Number(req.body?.rawAmount);
    const slippageBps = Number(req.body?.slippageBps ?? 300);
    const walletIndex = Number(req.body?.walletIndex ?? 0);

    if (!mint) throw new Error("mint is required");
    new PublicKey(mint);
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      throw new Error("rawAmount (token base units) must be positive");
    }
    if (!Number.isInteger(walletIndex) || !walletBank[walletIndex]) {
      throw new Error("walletIndex out of range");
    }

    const wallet = walletBank[walletIndex]!;
    const result = await sellTokenForSol({
      connection: connection(),
      wallet: wallet.keypair,
      inputMint: mint,
      rawAmount: Math.floor(rawAmount),
      slippageBps: Math.floor(slippageBps),
      dryRun: cfg.DRY_RUN,
    });

    pushLog({
      action: cfg.DRY_RUN ? "quote" : "sell",
      mint,
      dryRun: result.dryRun,
      ok: true,
      detail: `${result.message} · wallet ${walletIndex}`,
      signature: result.signature,
    });

    res.json(result);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    pushLog({
      action: "sell",
      mint: String(req.body?.mint ?? ""),
      dryRun: cfg.DRY_RUN,
      ok: false,
      detail,
    });
    res.status(400).json({ error: detail });
  }
});

app.get("/api/logs", (_req, res) => {
  res.json({ logs: listLogs() });
});

const webDist = path.resolve(__dirname, "../dist/web");
app.use(express.static(webDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(webDist, "index.html"), (err) => {
    if (err) {
      res
        .status(200)
        .type("html")
        .send(
          `<!doctype html><meta charset="utf-8"><title>Local Sol Trader</title>
           <p>UI not built yet. Run <code>npm run build:web</code>.</p>`
        );
    }
  });
});

app.listen(cfg.PORT, "127.0.0.1", () => {
  console.log(`Local Sol Trader on http://127.0.0.1:${cfg.PORT}`);
  console.log(
    `wallets=${walletBank.length} DRY_RUN=${cfg.DRY_RUN} MAX_BUY_SOL=${cfg.MAX_BUY_SOL}`
  );
  console.log(
    "Keys: local .env / WALLETS_FILE only. Parallel burst is a race, not an atomic lock."
  );
});