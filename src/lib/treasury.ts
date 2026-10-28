/**
 * OFFLINERICH treasury wallets — crypto from Stripe Onramp is locked here.
 * Stripe Crypto Onramp supports ethereum / polygon / base / bitcoin (not BSC).
 * The same EVM address is used on ethereum, polygon, and base.
 */
export const TREASURY = {
  evm: "0x1dbB04Fe817A2C49DB853f2C49d29Db441355FE9",
  bsc: "0x1dbB04Fe817A2C49DB853f2C49d29Db441355FE9",
  bitcoin: "bc1qly9n852q3j5csvgd59lcmazhfu74fc77x88vrj",
} as const;

/** Networks Stripe Onramp can deliver to for these wallets. */
export const ONRAMP_NETWORKS = [
  "ethereum",
  "polygon",
  "base",
  "bitcoin",
] as const;

export const ONRAMP_CURRENCIES = ["usdc", "eth", "btc"] as const;

export type OnrampNetwork = (typeof ONRAMP_NETWORKS)[number];
export type OnrampCurrency = (typeof ONRAMP_CURRENCIES)[number];

export function treasuryWalletAddresses() {
  return {
    ethereum: TREASURY.evm,
    polygon: TREASURY.evm,
    base: TREASURY.evm,
    bitcoin: TREASURY.bitcoin,
  };
}

export function defaultOnrampAmountUsd(): string {
  const cents = Number(process.env.NEXT_PUBLIC_STRIPE_PRICE_CENTS || "100");
  if (!Number.isFinite(cents) || cents <= 0) return "1.00";
  return (cents / 100).toFixed(2);
}
