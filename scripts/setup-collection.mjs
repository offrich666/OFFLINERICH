#!/usr/bin/env node
/**
 * Creates (or idempotently upserts) an OFFLINERICH sellable collection.
 *
 * Requires in .env.local:
 *   CROSSMINT_SERVER_API_KEY
 *   CROSSMINT_PAYOUT_ADDRESS   (wallet that receives sale proceeds)
 *
 * Optional:
 *   CROSSMINT_API_BASE
 *   NEXT_PUBLIC_CROSSMINT_PRICE
 *   CROSSMINT_COLLECTION_SLUG  (defaults to offlinerich-drop)
 */

import { readFileSync, existsSync, appendFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

const apiKey = process.env.CROSSMINT_SERVER_API_KEY;
const payout = process.env.CROSSMINT_PAYOUT_ADDRESS;
const apiBase =
  (process.env.CROSSMINT_API_BASE || "https://www.crossmint.com/api/2022-06-09").replace(
    /\/$/,
    "",
  );
const price = process.env.NEXT_PUBLIC_CROSSMINT_PRICE || "1";
const slug = process.env.CROSSMINT_COLLECTION_SLUG || "offlinerich-drop";

if (!apiKey) {
  console.error("Missing CROSSMINT_SERVER_API_KEY");
  process.exit(1);
}
if (!payout) {
  console.error(
    "Missing CROSSMINT_PAYOUT_ADDRESS. Set the wallet that should receive sale proceeds.",
  );
  process.exit(1);
}

const body = {
  chain: "polygon",
  metadata: {
    name: "OFFLINERICH Drop",
    description: "Official OFFLINERICH collectible drop",
    imageUrl: "https://www.crossmint.com/assets/crossmint/logo.png",
    symbol: "OFFRICH",
  },
  fungibility: "non-fungible",
  transferable: true,
  supplyLimit: 1000,
  payments: {
    price: String(price),
    recipientAddress: payout,
    currency: "usdc",
  },
};

const res = await fetch(`${apiBase}/collections/${encodeURIComponent(slug)}`, {
  method: "PUT",
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-API-KEY": apiKey,
  },
  body: JSON.stringify(body),
});

const text = await res.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  data = { raw: text };
}

if (!res.ok) {
  console.error("Failed to create collection:", res.status, data);
  process.exit(1);
}

const collectionId = data.id || slug;
console.log("Collection ready:", collectionId);
console.log("Set this in .env.local:");
console.log(`NEXT_PUBLIC_CROSSMINT_COLLECTION_ID=${collectionId}`);

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  const current = readFileSync(envPath, "utf8");
  if (current.includes("NEXT_PUBLIC_CROSSMINT_COLLECTION_ID=")) {
    writeFileSync(
      envPath,
      current.replace(
        /^NEXT_PUBLIC_CROSSMINT_COLLECTION_ID=.*$/m,
        `NEXT_PUBLIC_CROSSMINT_COLLECTION_ID=${collectionId}`,
      ),
    );
  } else {
    appendFileSync(
      envPath,
      `\nNEXT_PUBLIC_CROSSMINT_COLLECTION_ID=${collectionId}\n`,
    );
  }
  console.log("Updated .env.local");
}
