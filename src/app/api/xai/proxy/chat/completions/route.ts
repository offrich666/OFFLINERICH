import { connection } from "next/server";
import { corsPreflight, proxyChatCompletions } from "@/lib/xaiProxy";

export async function OPTIONS() {
  return corsPreflight();
}

export async function POST(req: Request) {
  await connection();
  return proxyChatCompletions(req);
}
