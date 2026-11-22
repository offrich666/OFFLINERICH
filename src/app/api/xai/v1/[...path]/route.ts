import { connection } from "next/server";
import {
  corsPreflight,
  logUnknownProxyHit,
  proxyChatCompletions,
  proxyModels,
  proxyResponses,
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

function isResponses(path: string): boolean {
  return path === "responses" || path.endsWith("/responses") || path === "v1/responses";
}

function isModels(path: string): boolean {
  return path === "models" || path.endsWith("/models") || path === "v1/models";
}

export async function OPTIONS() {
  return corsPreflight();
}

/** Catch Cursor path variants like /v1/v1/chat/completions and /responses. */
export async function GET(req: Request, ctx: Ctx) {
  await connection();
  const path = joinPath((await ctx.params).path);
  if (isModels(path)) return proxyModels(req);
  logUnknownProxyHit(req, 404, `unhandled GET ${path}`);
  return Response.json(
    {
      error: "not_found",
      path,
      hint: "expected /models, /chat/completions, or /responses",
    },
    { status: 404 },
  );
}

export async function POST(req: Request, ctx: Ctx) {
  await connection();
  const path = joinPath((await ctx.params).path);
  if (isChatCompletions(path)) return proxyChatCompletions(req);
  if (isResponses(path)) return proxyResponses(req);
  logUnknownProxyHit(req, 404, `unhandled POST ${path}`);
  return Response.json(
    {
      error: "not_found",
      path,
      hint: "expected /chat/completions or /responses",
    },
    { status: 404 },
  );
}
