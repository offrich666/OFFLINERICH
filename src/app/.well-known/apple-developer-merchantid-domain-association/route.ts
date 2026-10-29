import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

/**
 * Optional Apple Pay domain association file.
 * Stripe Crypto Onramp + Payment Method Domains handle Apple Pay for
 * www.walletchainsign.com via Dashboard/API (already registered).
 * This endpoint remains for Crossmint or a manual Apple association file.
 */
export async function GET() {
  const fromEnv = process.env.APPLE_PAY_DOMAIN_ASSOCIATION?.trim();
  if (fromEnv) {
    return new NextResponse(fromEnv, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  try {
    const filePath = join(
      process.cwd(),
      "public",
      ".well-known",
      "apple-developer-merchantid-domain-association",
    );
    const content = await readFile(filePath, "utf8");
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("ok\n", {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  }
}
