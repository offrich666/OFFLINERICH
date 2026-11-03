import "server-only";
import { promises as fs } from "fs";
import path from "path";

/** Vercel serverless FS is read-only except /tmp. Local/dev uses ./data. */
export const DATA_DIR =
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? path.join("/tmp", "fundedxl-data")
    : path.join(process.cwd(), "data");

export async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonFile<T>(filePath: string, value: T): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}
