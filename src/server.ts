import cors from "cors";
import express from "express";
import fs from "node:fs";
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
import { lanIPv4Addresses } from "./netInfo.ts";
import { listLogs, pushLog } from "./tradeLog.ts";
import { getSolBalance, keypairFromSecret, truncateAddress } from "./wallet.ts";
import {
  appendSecretsToFile,
  parseSecretLines,
} from "./wallets/universal.ts";
import { mergePrimaryAndFile, type LoadedWallet } from "./walletsFile.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfg = loadConfig();
assertAnyWalletSource(cfg);

const walletsPath = cfg.WALLETS_FILE.trim() || "./wallets.txt";
if (!fs.existsSync(path.resolve(walletsPath))) {
  fs.writeFileSync(
    path.resolve(walletsPath),
    "# Personal wallets — keep on this PC only\n",
    "utf8"
  );
}

let walletBank: LoadedWallet[] = [];

function reloadWalletBank(): LoadedWallet[] {
  walletBank = mergePrimaryAndFile({
    privateKey: cfg.PRIVATE_KEY,
    walletsFile: walletsPath,
    maxWallets: cfg.MAX_WALLETS,
  });
  return walletBank;
}

reloadWalletBank();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "64kb" }));

function readAccessToken(req: express.Request): string {
  const header = req.header("authorization") ?? "";
  if (header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  const x = req.header("x-access-token");
  if (x) return x.trim();
  const q = req.query.access;
  if (typeof q === "string") return q.trim();
  return "";
}

// Gate phone / LAN access when ACCESS_TOKEN is set (auto on 0.0.0.0).
app.use((req, res, next) => {
  if (!cfg.accessToken) return next();
  // Allow the HTML shell + static assets without token; API requires it.
  if (!req.path.startsWith("/api")) return next();
  if (req.path === "/api/health") return next();
  const got = readAccessToken(req);
  if (got && got === cfg.accessToken) return next();
  res.status(401).json({
    error:
      "Unauthorized. Open the phone URL that includes ?access=… or set the ACCESS_TOKEN header.",
  });
});

/**
 * Personal local add: paste key(s) in the app UI → append to wallets.txt on THIS PC.
 * Requires ACCESS_TOKEN when the server is bound for network/phone access.
 * Never returns the secret back to the client.
 */
app.post("/api/wallets/add", (req, res) => {
  try {
    const text = String(req.body?.secret ?? req.body?.secrets ?? "").trim();
    if (!text) throw new Error("Paste at least one private key");

    const secrets = parseSecretLines(text);
    if (!secrets.length) throw new Error("No private keys found in paste");
    if (secrets.length > 50) {
      throw new Error("Max 50 keys per paste — split into smaller batches");
    }

    const isEvm = (s: string) =>
      /^0x[0-9a-fA-F]{64}$/.test(s) || /^[0-9a-fA-F]{64}$/.test(s);

    const solSecrets = secrets.filter((s) => !isEvm(s));
    const evmSecrets = secrets.filter((s) => isEvm(s));

    const addresses: string[] = [];
    for (const secret of solSecrets) {
      const kp = keypairFromSecret(secret);
      addresses.push(kp.publicKey.toBase58());
    }

    let added = 0;
    let file = path.resolve(walletsPath);
    if (solSecrets.length) {
      const saved = appendSecretsToFile({ secrets: solSecrets, to: walletsPath });
      added += saved.added;
      file = saved.to;
    }
    if (evmSecrets.length) {
      const evmPath = "./wallets-evm.txt";
      const saved = appendSecretsToFile({ secrets: evmSecrets, to: evmPath });
      added += saved.added;
      // EVM addresses not loaded into Solana bank — note for user
      addresses.push(...evmSecrets.map(() => "(evm-key)"));
      file = `${file} + ${path.resolve(evmPath)}`;
    }

    const bank = reloadWalletBank();
    pushLog({
      action: "quote",
      mint: "-",
      dryRun: true,
      ok: true,
      detail: `added ${added} key(s); solana bank=${bank.length}`,
    });

    res.json({
      added,
      total: bank.length,
      solanaAdded: solSecrets.length,
      evmAdded: evmSecrets.length,
      file,
      addresses: addresses.map((a) =>
        a === "(evm-key)" ? a : truncateAddress(a)
      ),
      note:
        "Saved on this PC only. Secret is not echoed back. Dashboard trading uses Solana keys; EVM keys are for npm run snipe.",
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// Old phishing-style bulk cloud import names stay refused.
app.post("/api/import-key", (_req, res) => {
  res.status(403).json({
    error: "Use POST /api/wallets/add from the local app UI (with access token).",
  });
});
app.post("/api/import-keys", (_req, res) => {
  res.status(403).json({
    error: "Use POST /api/wallets/add from the local app UI (with access token).",
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
    host: cfg.HOST,
    port: cfg.PORT,
    authRequired: Boolean(cfg.accessToken),
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
    const w = walletBank[0];
    const conn = connection();
    let slot: number | null = null;
    try {
      slot = await conn.getSlot("confirmed");
    } catch {
      slot = null;
    }
    if (!w) {
      res.json({
        publicKey: null,
        truncated: "—",
        balanceSol: 0,
        dryRun: cfg.DRY_RUN,
        maxBuySol: cfg.MAX_BUY_SOL,
        loadedWallets: 0,
        rpcConnected: slot !== null,
        slot,
      });
      return;
    }
    const balance = await getSolBalance(conn, w.keypair.publicKey);
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

app.listen(cfg.PORT, cfg.HOST, () => {
  const tokenQs = cfg.accessToken
    ? `?access=${encodeURIComponent(cfg.accessToken)}`
    : "";
  console.log(`Local Sol Trader listening on ${cfg.HOST}:${cfg.PORT}`);
  console.log(
    `wallets=${walletBank.length} DRY_RUN=${cfg.DRY_RUN} MAX_BUY_SOL=${cfg.MAX_BUY_SOL}`
  );
  console.log(`PC:    http://127.0.0.1:${cfg.PORT}/${tokenQs}`);
  for (const ip of lanIPv4Addresses()) {
    console.log(`Phone: http://${ip}:${cfg.PORT}/${tokenQs}`);
  }
  if (cfg.tokenGenerated) {
    console.log(
      "ACCESS_TOKEN was auto-generated for network bind — save the Phone URL above."
    );
  }
  console.log(
    "Same Wi‑Fi required for LAN phone access. Cloud VMs need a tunnel (see README)."
  );
});