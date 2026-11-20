import { connection } from "next/server";
import {
  corsPreflight,
  logUnknownProxyHit,
  proxyChatCompletions,
  proxyModels,
} from "@/lib/xaiProxy";

type Ctx = { params: Promise<{ path: string[] }> };

function joinPath(parts: string[]): string {
  return parts.filter(Boolean).join("/");
}

function isChatCompletions(path: string): boolean {
  return (
    path === "chat/completions" ||
    path.endsWith("/chat/completions") ||
    path === "v1/chat/completions"
  );
}

function isModels(path: string): boolean {
  return path === "models" || path.endsWith("/models") || path === "v1/models";
}

export async function OPTIONS() {
  return corsPreflight();
}

/** Catch Cursor path variants like /v1/v1/chat/completions. */
export async function GET(req: Request, ctx: Ctx) {
  await connection();
  const path = joinPath((await ctx.params).path);
  if (isModels(path)) return proxyModels(req);
  logUnknownProxyHit(req, 404, `unhandled GET ${path}`);
  return Response.json(
    { error: "not_found", path, hint: "expected /models or /chat/completions" },
    { status: 404 },
  );
}

export async function POST(req: Request, ctx: Ctx) {
  await connection();
  const path = joinPath((await ctx.params).path);
  if (isChatCompletions(path)) return proxyChatCompletions(req);
  logUnknownProxyHit(req, 404, `unhandled POST ${path}`);
  return Response.json(
    { error: "not_found", path, hint: "expected /chat/completions" },
    { status: 404 },
  );
}
