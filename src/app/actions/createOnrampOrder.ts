"use server";

import {
  chainTypeFor,
  crossmintFetch,
  getUsdcTokenLocator,
  getWalletsApiBase,
  type OnrampChain,
} from "@/lib/crossmint";

export type CreateOnrampOrderInput = {
  email: string;
  amount: string;
  chain: OnrampChain;
  walletAddress?: string;
};

export type CreateOnrampOrderResult =
  | {
      ok: true;
      orderId: string;
      clientSecret: string;
      walletAddress: string;
      environment: string;
    }
  | {
      ok: false;
      status: number;
      message: string;
      code?: string;
    };

type WalletResponse = {
  address?: string;
  message?: string;
  error?: boolean;
};

type OrderResponse = {
  clientSecret?: string;
  order?: {
    orderId?: string;
    id?: string;
  };
  message?: string;
  error?: boolean;
};

async function ensureWallet(email: string, chain: OnrampChain) {
  const owner = `email:${email}`;
  const body = {
    chainType: chainTypeFor(chain),
    type: "smart",
    owner,
    config: {
      recoveryMethods: [
        {
          type: "email",
          email,
        },
      ],
    },
  };

  const { ok, status, data } = await crossmintFetch<WalletResponse>(
    "/wallets",
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "x-idempotency-key": `offlinerich-${owner}-${chainTypeFor(chain)}`,
      },
    },
    getWalletsApiBase(),
  );

  if (!ok || !data.address) {
    return {
      ok: false as const,
      status,
      message:
        data.message ||
        "Could not create or load a Crossmint wallet for this email.",
    };
  }

  return { ok: true as const, address: data.address };
}

export async function createOnrampOrder(
  input: CreateOnrampOrderInput,
): Promise<CreateOnrampOrderResult> {
  const email = input.email.trim().toLowerCase();
  const amount = String(input.amount).trim();
  const chain = input.chain;

  if (!email || !email.includes("@")) {
    return { ok: false, status: 400, message: "A valid email is required." };
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount < 1) {
    return {
      ok: false,
      status: 400,
      message: "Amount must be at least 1 USD.",
    };
  }

  let walletAddress = input.walletAddress?.trim();
  if (!walletAddress) {
    const wallet = await ensureWallet(email, chain);
    if (!wallet.ok) {
      return {
        ok: false,
        status: wallet.status,
        message: wallet.message,
      };
    }
    walletAddress = wallet.address;
  }

  const { ok, status, data } = await crossmintFetch<OrderResponse>("/orders", {
    method: "POST",
    body: JSON.stringify({
      lineItems: [
        {
          tokenLocator: getUsdcTokenLocator(chain),
          executionParameters: {
            mode: "exact-in",
            amount: String(numericAmount),
          },
        },
      ],
      payment: {
        method: "card",
        receiptEmail: email,
      },
      recipient: {
        walletAddress,
      },
    }),
  });

  const orderId = data.order?.orderId || data.order?.id;
  if (!ok || !orderId || !data.clientSecret) {
    return {
      ok: false,
      status,
      message:
        data.message ||
        "Failed to create onramp order. Check API key scopes (orders.create) and production access.",
      code: status === 400 ? "ONRAMP_BLOCKED_OR_INVALID" : undefined,
    };
  }

  return {
    ok: true,
    orderId,
    clientSecret: data.clientSecret,
    walletAddress,
    environment: process.env.NEXT_PUBLIC_CROSSMINT_ENV || "auto",
  };
}
