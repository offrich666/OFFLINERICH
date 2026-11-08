import { NextResponse } from "next/server";

/**
 * Stripe hosted Instant (crypto.link.com) is disabled.
 * Buyers use on-page Stripe Embedded Checkout at /checkout instead.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Hosted crypto.link.com checkout is disabled. Use on-page card checkout at /checkout.",
      code: "hosted_onramp_disabled",
      use: "/checkout",
    },
    { status: 410 },
  );
}
