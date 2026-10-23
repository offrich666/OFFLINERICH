import { config as loadEnv } from "dotenv";
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
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    throw new Error(`Invalid config: ${msg}`);
  }
  return parsed.data;
}

export function assertAnyWalletSource(cfg: AppConfig): void {
  if (!cfg.PRIVATE_KEY.trim() && !cfg.WALLETS_FILE.trim()) {
    throw new Error(
      "Set PRIVATE_KEY and/or WALLETS_FILE in local .env. Keys are never accepted over HTTP."
    );
  }
}