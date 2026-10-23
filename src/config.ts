import { config as loadEnv } from "dotenv";
import { randomBytes } from "node:crypto";
import { z } from "zod";

loadEnv();

const schema = z.object({
  PRIVATE_KEY: z.string().optional().default(""),
  /** Local file with many secrets (one per line or JSON array). Never HTTP. */
  WALLETS_FILE: z.string().optional().default(""),
  RPC_URL: z
    .string()
    .url()
    .default("https://api.mainnet-beta.solana.com"),
  DRY_RUN: z
    .string()
    .optional()
    .default("true")
    .transform((v) => v.toLowerCase() !== "false"),
  MAX_BUY_SOL: z.coerce.number().positive().default(0.1),
  MAX_WALLETS: z.coerce.number().int().positive().default(500),
  SKIP_PREFLIGHT: z
    .string()
    .optional()
    .default("true")
    .transform((v) => v.toLowerCase() !== "false"),
  PORT: z.coerce.number().int().positive().default(3847),
  /** 0.0.0.0 = reachable from phone on same Wi‑Fi / via tunnel */
  HOST: z.string().default("0.0.0.0"),
  /**
   * Shared secret for phone / LAN access.
   * Empty + non-loopback host → auto-generated at startup.
   */
  ACCESS_TOKEN: z.string().optional().default(""),
});

export type AppConfig = z.infer<typeof schema> & {
  /** Effective token after auto-generate */
  accessToken: string;
  tokenGenerated: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    throw new Error(`Invalid config: ${msg}`);
  }
  const base = parsed.data;
  const loopback = base.HOST === "127.0.0.1" || base.HOST === "localhost";
  let accessToken = base.ACCESS_TOKEN.trim();
  let tokenGenerated = false;
  if (!accessToken && !loopback) {
    accessToken = randomBytes(18).toString("base64url");
    tokenGenerated = true;
  }
  return { ...base, accessToken, tokenGenerated };
}

export function assertAnyWalletSource(cfg: AppConfig): void {
  if (!cfg.PRIVATE_KEY.trim() && !cfg.WALLETS_FILE.trim()) {
    throw new Error(
      "Set PRIVATE_KEY and/or WALLETS_FILE in local .env. Keys are never accepted over HTTP."
    );
  }
}

export function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}