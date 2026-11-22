import { connection } from "next/server";
import { corsPreflight, proxyModels } from "@/lib/xaiProxy";

export async function OPTIONS() {
  return corsPreflight();
}

export async function GET(req: Request) {
  await connection();
  return proxyModels(req);
}
