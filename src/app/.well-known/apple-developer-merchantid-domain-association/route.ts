import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

/**
 * Apple Pay domain verification file.
 * Download from Crossmint Console → Apple Pay Domains, then either:
 * 1) set APPLE_PAY_DOMAIN_ASSOCIATION to the file contents, or
 * 2) place the file at public/.well-known/apple-developer-merchantid-domain-association
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
    return new NextResponse(
      [
        "Apple Pay domain association file is not configured yet.",
        "",
        "1. Open Crossmint Console → Apple Pay Domains",
        "2. Download the verification file",
        "3. Paste contents into APPLE_PAY_DOMAIN_ASSOCIATION, or save as",
        "   public/.well-known/apple-developer-merchantid-domain-association",
        "4. Verify your HTTPS domain in the console",
      ].join("\n"),
      {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      },
    );
  }
}
