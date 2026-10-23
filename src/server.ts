import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { assertKeyPresent, loadConfig } from "./config.ts";
import { buyWithSol, sellTokenForSol } from "./jupiter.ts";
import { listLogs, pushLog } from "./tradeLog.ts";
import { getSolBalance, keypairFromSecret, truncateAddress } from "./wallet.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfg = loadConfig();
const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: "32kb" }));

// Hard rule: this API never accepts private keys from the browser.
app.post("/api/import-key", (_req, res) => {
  res.status(403).json({
    error:
      "Refused. Private keys are not accepted over HTTP. Put PRIVATE_KEY in your local .env only. Sites like random *.cloud dashboards that ask you to paste keys are a common drain vector.",
  });
});

function requireWallet() {
  assertKeyPresent(cfg);
  return keypairFromSecret(cfg.PRIVATE_KEY);
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    dryRun: cfg.DRY_RUN,
    maxBuySol: cfg.MAX_BUY_SOL,
    rpc: cfg.RPC_URL,
    note: "Personal local trader. No hosted key custody.",
  });
});

app.get("/api/wallet", async (_req, res) => {
  try {
    const wallet = requireWallet();
    const connection = new Connection(cfg.RPC_URL, "confirmed");
    const balance = await getSolBalance(connection, wallet.publicKey);
    let slot: number | null = null;
    try {
      slot = await connection.getSlot("confirmed");
    } catch {
      slot = null;
    }
    res.json({
      publicKey: wallet.publicKey.toBase58(),
      truncated: truncateAddress(wallet.publicKey.toBase58()),
      balanceSol: balance,
      dryRun: cfg.DRY_RUN,
      maxBuySol: cfg.MAX_BUY_SOL,
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
    if (!Number.isFinite(slippageBps) || slippageBps < 1 || slippageBps > 5000) {
      throw new Error("slippageBps must be between 1 and 5000");
    }

    const wallet = requireWallet();
    const connection = new Connection(cfg.RPC_URL, "confirmed");
    const result = await buyWithSol({
      connection,
      wallet,
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
      detail: result.message,
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

app.post("/api/sell", async (req, res) => {
  try {
    const mint = String(req.body?.mint ?? "").trim();
    const rawAmount = Number(req.body?.rawAmount);
    const slippageBps = Number(req.body?.slippageBps ?? 300);

    if (!mint) throw new Error("mint is required");
    new PublicKey(mint);
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      throw new Error("rawAmount (token base units) must be positive");
    }

    const wallet = requireWallet();
    const connection = new Connection(cfg.RPC_URL, "confirmed");
    const result = await sellTokenForSol({
      connection,
      wallet,
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
      detail: result.message,
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
           <p>UI not built yet. Run <code>npm run build:web</code>, or open the API at <code>/api/health</code>.</p>`
        );
    }
  });
});

app.listen(cfg.PORT, "127.0.0.1", () => {
  console.log(`Local Sol Trader on http://127.0.0.1:${cfg.PORT}`);
  console.log(`DRY_RUN=${cfg.DRY_RUN}  MAX_BUY_SOL=${cfg.MAX_BUY_SOL}`);
  console.log(
    "Private keys: local .env only. Never paste keys into cloud dashboards."
  );
});