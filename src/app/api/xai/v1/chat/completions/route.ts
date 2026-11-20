import { connection } from "next/server";
import { corsPreflight, proxyChatCompletions } from "@/lib/xaiProxy";

export async function OPTIONS() {
  return corsPreflight();
}

/** OpenAI-compatible live proxy for Cursor Override Base URL. */
export async function POST(req: Request) {
  await connection();
  return proxyChatCompletions(req);
}
