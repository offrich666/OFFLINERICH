import { NextResponse } from "next/server";
import {
  getTransakApiKey,
  getTransakEnvironment,
  isTransakConfigured,
} from "@/lib/transak";

export async function GET() {
  const configured = isTransakConfigured();
  const key = getTransakApiKey();
  return NextResponse.json({
    provider: "transak",
    configured,
    environment: getTransakEnvironment(),
    apiKeyPresent: Boolean(key),
    apiKeyPrefix: key ? `${key.slice(0, 8)}…` : null,
    signupUrl: "https://dashboard.transak.com",
    readyForInstantCrypto: configured,
    nextSteps: configured
      ? []
      : [
          "Sign up at https://dashboard.transak.com",
          "Copy Staging API Key + API Secret",
          "Set TRANSAK_API_KEY + TRANSAK_API_SECRET (+ TRANSAK_ENVIRONMENT=STAGING)",
          "Whitelist www.walletchainsign.com",
          "Redeploy",
        ],
  });
}
