/**
 * OFFLINERICH treasury wallets — crypto from Stripe Onramp is locked here.
 *
 * G N LABS LLC is Ireland (EU). Stripe Onramp for EU consumers does NOT
 * support USDC on Polygon/Base/Solana/Avalanche — use Ethereum (+ Bitcoin).
 * Same EVM address is used when ops later send to client on Polygon/Base/BSC.
 */
export const TREASURY = {
  evm: "0x1dbB04Fe817A2C49DB853f2C49d29Db441355FE9",
  bsc: "0x1dbB04Fe817A2C49DB853f2C49d29Db441355FE9",
  bitcoin: "bc1qly9n852q3j5csvgd59lcmazhfu74fc77x88vrj",
} as const;

/** Networks Stripe Onramp can deliver to for this EU merchant. */
export const ONRAMP_NETWORKS = ["ethereum", "bitcoin"] as const;

export const ONRAMP_CURRENCIES = ["usdc", "eth", "btc"] as const;

export type OnrampNetwork = (typeof ONRAMP_NETWORKS)[number];
export type OnrampCurrency = (typeof ONRAMP_CURRENCIES)[number];

export function treasuryWalletAddresses() {
  return {
    ethereum: TREASURY.evm,
    bitcoin: TREASURY.bitcoin,
  };
}

export function defaultOnrampAmountUsd(): string {
  const cents = Number(process.env.NEXT_PUBLIC_STRIPE_PRICE_CENTS || "1000");
  if (!Number.isFinite(cents) || cents <= 0) return "10.00";
  return (cents / 100).toFixed(2);
}
