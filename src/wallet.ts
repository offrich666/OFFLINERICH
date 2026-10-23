import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import bs58 from "bs58";

export function keypairFromSecret(secret: string): Keypair {
  const trimmed = secret.trim();
  if (!trimmed) {
    throw new Error("PRIVATE_KEY is empty");
  }

  // Support base58 secret key (Phantom export) or JSON byte array
  if (trimmed.startsWith("[")) {
    const bytes = Uint8Array.from(JSON.parse(trimmed) as number[]);
    return Keypair.fromSecretKey(bytes);
  }

  return Keypair.fromSecretKey(bs58.decode(trimmed));
}

export async function getSolBalance(
  connection: Connection,
  pubkey: PublicKey
): Promise<number> {
  const lamports = await connection.getBalance(pubkey, "confirmed");
  return lamports / LAMPORTS_PER_SOL;
}

export function truncateAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}