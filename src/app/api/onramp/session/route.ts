import { NextResponse } from "next/server";

/**
 * Stripe hosted Instant (crypto.link.com) is disabled — it fails at Pay.
 * Buyers use on-page Crossmint card → direct crypto at /checkout instead.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Hosted crypto.link.com checkout is disabled. Use on-page checkout at /checkout for direct crypto.",
      code: "hosted_onramp_disabled",
      use: "/checkout",
    },
    { status: 410 },
  );
}
