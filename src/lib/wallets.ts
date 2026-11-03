import "server-only";
import { createHash, randomBytes } from "crypto";
import path from "path";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { Wallet } from "ethers";
import { DATA_DIR, readJsonFile, writeJsonFile } from "@/lib/store";

export type CryptoNetwork = "solana" | "bsc" | "tron";

export type NetworkWallet = {
  network: CryptoNetwork;
  label: string;
  asset: string;
  address: string;
  /** NEVER expose via public client APIs */
  privateKey: string;
  createdAt: string;
};

export type WalletVault = {
  createdAt: string;
  note: string;
  wallets: NetworkWallet[];
};

const VAULT_FILE = path.join(DATA_DIR, "crypto-wallets.secrets.json");

/** Keccak-256 for Tron address (Ethereum-compatible). */
async function keccak256(data: Uint8Array): Promise<Uint8Array> {
  // ethers keccak via Wallet is heavy; use noble if available through ethers
  const { keccak256: k, getBytes } = await import("ethers");
  return getBytes(k(data));
}

function base58CheckEncode(payload: Uint8Array): string {
  const hash1 = createHash("sha256").update(payload).digest();
  const hash2 = createHash("sha256").update(hash1).digest();
  const checksum = hash2.subarray(0, 4);
  const full = new Uint8Array(payload.length + 4);
  full.set(payload, 0);
  full.set(checksum, payload.length);
  return bs58.encode(full);
}

async function generateTronWallet(): Promise<{ address: string; privateKey: string }> {
  const evm = Wallet.createRandom();
  const priv = evm.privateKey; // 0x...
  // uncompressed pubkey without 0x04 prefix → keccak → last 20 bytes
  const { SigningKey, getBytes } = await import("ethers");
  const signingKey = new SigningKey(priv);
  const pub = getBytes(signingKey.publicKey); // 65 bytes, 0x04...
  const hash = await keccak256(pub.slice(1));
  const addr20 = hash.slice(12);
  const tronPayload = new Uint8Array(21);
  tronPayload[0] = 0x41;
  tronPayload.set(addr20, 1);
  const address = base58CheckEncode(tronPayload);
  return { address, privateKey: priv.replace(/^0x/, "") };
}

async function generateSolanaWallet(): Promise<{
  address: string;
  privateKey: string;
}> {
  const kp = await Promise.resolve(Keypair.generate());
  return {
    address: kp.publicKey.toBase58(),
    privateKey: bs58.encode(kp.secretKey),
  };
}

function generateBscWallet(): { address: string; privateKey: string } {
  const w = Wallet.createRandom();
  return {
    address: w.address,
    privateKey: w.privateKey,
  };
}

export async function ensureReceiveWallets(): Promise<WalletVault> {
  const existing = await readJsonFile<WalletVault | null>(VAULT_FILE, null);
  if (existing?.wallets?.length === 3) return existing;

  const now = new Date().toISOString();
  const sol = await generateSolanaWallet();
  const bsc = generateBscWallet();
  const tron = await generateTronWallet();

  const vault: WalletVault = {
    createdAt: now,
    note: "Funded XL merchant receive wallets. Private keys are server-only — never commit this file.",
    wallets: [
      {
        network: "solana",
        label: "Solana (SPL USDT/USDC)",
        asset: "USDT",
        address: sol.address,
        privateKey: sol.privateKey,
        createdAt: now,
      },
      {
        network: "bsc",
        label: "BNB Smart Chain (BEP-20)",
        asset: "USDT",
        address: bsc.address,
        privateKey: bsc.privateKey,
        createdAt: now,
      },
      {
        network: "tron",
        label: "TRON (TRC-20)",
        asset: "USDT",
        address: tron.address,
        privateKey: tron.privateKey,
        createdAt: now,
      },
    ],
  };

  await writeJsonFile(VAULT_FILE, vault);
  return vault;
}

/** Public deposit addresses only — no private keys. */
export async function getPublicDepositAddresses() {
  const vault = await ensureReceiveWallets();
  return vault.wallets.map(({ network, label, asset, address }) => ({
    network,
    label,
    asset,
    address,
  }));
}

/** Admin-only: full vault including private keys. */
export async function getVaultWithSecrets(): Promise<WalletVault> {
  return ensureReceiveWallets();
}

export type CryptoInvoice = {
  id: string;
  createdAt: string;
  userId: string;
  email: string;
  program: string;
  size: number;
  amountUsd: number;
  network: CryptoNetwork;
  address: string;
  asset: string;
  status: "pending" | "paid" | "expired";
  purchaseId: string;
};

const INVOICES_FILE = path.join(DATA_DIR, "crypto-invoices.json");

export async function createCryptoInvoice(input: {
  userId: string;
  email: string;
  program: string;
  size: number;
  amountUsd: number;
  network: CryptoNetwork;
  purchaseId: string;
}): Promise<CryptoInvoice> {
  const vault = await ensureReceiveWallets();
  const wallet = vault.wallets.find((w) => w.network === input.network);
  if (!wallet) throw new Error("Unsupported network");

  const invoices = await readJsonFile<CryptoInvoice[]>(INVOICES_FILE, []);
  const invoice: CryptoInvoice = {
    id: `cinv_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`,
    createdAt: new Date().toISOString(),
    userId: input.userId,
    email: input.email,
    program: input.program,
    size: input.size,
    amountUsd: input.amountUsd,
    network: input.network,
    address: wallet.address,
    asset: wallet.asset,
    status: "pending",
    purchaseId: input.purchaseId,
  };
  invoices.unshift(invoice);
  await writeJsonFile(INVOICES_FILE, invoices);
  return invoice;
}

export async function listCryptoInvoices(): Promise<CryptoInvoice[]> {
  return readJsonFile<CryptoInvoice[]>(INVOICES_FILE, []);
}

export async function markCryptoInvoicePaid(
  invoiceId: string,
): Promise<CryptoInvoice | null> {
  const invoices = await readJsonFile<CryptoInvoice[]>(INVOICES_FILE, []);
  const inv = invoices.find((i) => i.id === invoiceId);
  if (!inv) return null;
  inv.status = "paid";
  await writeJsonFile(INVOICES_FILE, invoices);
  return inv;
}

export function isValidOpsKey(key: string | null | undefined): boolean {
  const expected = process.env.OPS_SECRET || "funded-xl-ops";
  return Boolean(key) && key === expected;
}
