import { isAddress } from './abi.ts';
import { CHAINS } from './chains.ts';
import { isLiveImmersveKey, isTestImmersveKey } from './issuer.ts';

export type ReadinessItem = {
  id: string;
  ready: boolean;
  title: string;
  detail: string;
};

export type Config = {
  port: number;
  databasePath: string;
  immersveApiKey: string;
  immersveApiSecret: string;
  immersveClientApplicationId: string;
  immersvePartnerAccountId: string;
  immersveCardProgramId: string;
  immersveFundingChannelId: string;
  immersveFundsStorageAddress: string | null;
  immersveFundingTypeName: string;
  immersveClientOrigin: string;
  immersveNetwork: string;
  livemode: boolean;
  treasuryAddress: string | null;
  feeBps: number;
  minTopupCents: number;
  maxTopupCents: number;
  blockedCountries: string[];
  keySource: 'env' | 'saved' | 'none';
  visaApiKey: string;
  visaSharedSecret: string;
  visaApiBase: string;
  visaCertPath: string;
  visaKeyPath: string;
  cardBin: string;
  operatorToken: string;
  secureCookies: boolean;
  trustProxy: boolean;
  selfSignup: boolean;
  pay2ApiKey: string;
  pay2KeyId: string;
  pay2PrivateKeyPem: string;
  pay2AccountNumber: string;
  pay2BinNumber: string;
  pay2Ready: boolean;
  upgradeUsdcAddress: string;
  upgradePriceUsd: number;
  publicBaseUrl: string;
  rpcUrls: Record<number, string>;
};

export type Env = Record<string, string | undefined>;

function integer(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(env: Env): Config {
  const immersveApiKey = env.IMMERSVE_API_KEY?.trim() ?? '';
  const immersveApiSecret = env.IMMERSVE_API_SECRET?.trim() ?? '';
  const treasuryRaw = env.TREASURY_ADDRESS?.trim() ?? '';
  if (treasuryRaw && !isAddress(treasuryRaw)) {
    throw new Error('TREASURY_ADDRESS must be a 0x wallet address.');
  }
  const treasuryAddress = treasuryRaw ? treasuryRaw.toLowerCase() : null;
  const feeBps = Math.min(1000, Math.max(0, integer(env.TOPUP_FEE_BPS, 100)));
  const cardBin = env.CARD_BIN?.trim() ?? '';
  const rpcUrls: Record<number, string> = {};
  for (const chain of CHAINS) {
    const override = env[`RPC_URL_${chain.id}`];
    if (override) rpcUrls[chain.id] = override;
  }
  const pay2ApiKey = env.PAY2_API_KEY?.trim() ?? '';
  const pay2KeyId = env.PAY2_KEY_ID?.trim() ?? '';
  const pay2PrivateKeyPem = (env.PAY2_PRIVATE_KEY_PEM ?? '').replace(/\\n/g, '\n').trim();
  const pay2AccountNumber = env.PAY2_ACCOUNT_NUMBER?.trim() ?? '';
  const pay2BinNumber = env.PAY2_BIN_NUMBER?.trim() ?? '';
  return {
    port: integer(env.PORT, 8787),
    databasePath: env.DATABASE_PATH?.trim() || './data/offlinerich.sqlite',
    immersveApiKey,
    immersveApiSecret,
    immersveClientApplicationId: env.IMMERSVE_CLIENT_APPLICATION_ID?.trim() ?? '',
    immersvePartnerAccountId: env.IMMERSVE_PARTNER_ACCOUNT_ID?.trim() ?? '',
    immersveCardProgramId: env.IMMERSVE_CARD_PROGRAM_ID?.trim() ?? '',
    immersveFundingChannelId: env.IMMERSVE_FUNDING_CHANNEL_ID?.trim() ?? '',
    immersveFundsStorageAddress: (() => {
      const raw = env.IMMERSVE_FUNDS_STORAGE_ADDRESS?.trim() ?? '';
      return raw && isAddress(raw) ? raw.toLowerCase() : null;
    })(),
    immersveFundingTypeName: env.IMMERSVE_FUNDING_TYPE_NAME?.trim() ?? '',
    immersveClientOrigin: (env.IMMERSVE_CLIENT_ORIGIN?.trim() || 'https://localhost').replace(/\/$/, ''),
    immersveNetwork: env.IMMERSVE_NETWORK?.trim() || 'base-mainnet',
    livemode: isLiveImmersveKey(immersveApiKey, immersveApiSecret),
    treasuryAddress,
    feeBps,
    minTopupCents: Math.max(1, integer(env.MIN_TOPUP_CENTS, 100)),
    maxTopupCents: Math.max(1, integer(env.MAX_TOPUP_CENTS, 5_000_000)),
    blockedCountries: (env.BLOCKED_MERCHANT_COUNTRIES ?? '')
      .split(',')
      .map((country) => country.trim().toUpperCase())
      .filter((country) => /^[A-Z]{2}$/.test(country)),
    keySource: immersveApiKey ? 'env' : 'none',
    visaApiKey: env.VISA_API_KEY?.trim() ?? '',
    visaSharedSecret: env.VISA_SHARED_SECRET?.trim() ?? '',
    visaApiBase: (env.VISA_API_BASE?.trim() || 'https://sandbox.api.visa.com').replace(/\/$/, ''),
    visaCertPath: env.VISA_CERT_PATH?.trim() ?? '',
    visaKeyPath: env.VISA_KEY_PATH?.trim() ?? '',
    cardBin: /^\d{6,8}$/.test(cardBin) ? cardBin : '',
    operatorToken: env.OPERATOR_TOKEN?.trim() ?? '',
    secureCookies: env.SECURE_COOKIES === 'true',
    trustProxy: env.TRUST_PROXY === 'true',
    selfSignup: env.SELF_SIGNUP === '1',
    pay2ApiKey,
    pay2KeyId,
    pay2PrivateKeyPem,
    pay2AccountNumber,
    pay2BinNumber,
    pay2Ready: Boolean(pay2ApiKey && pay2KeyId && pay2PrivateKeyPem && pay2AccountNumber),
    upgradeUsdcAddress: env.UPGRADE_USDC_ADDRESS?.trim() || env.UPGRADE_USDT_ADDRESS?.trim() || '',
    upgradePriceUsd: Math.max(1, integer(env.UPGRADE_PRICE_USD, 1300)),
    publicBaseUrl: (env.PUBLIC_BASE_URL ?? '').trim().replace(/\/$/, ''),
    rpcUrls,
  };
}

function fillSaved(envValue: string | undefined, savedValue: string | undefined, apply: (value: string) => void): void {
  if (envValue?.trim()) return;
  if (savedValue?.trim()) apply(savedValue.trim());
}

export function overlaySaved(config: Config, saved: Record<string, string>, env: Env): void {
  fillSaved(env.IMMERSVE_API_KEY, saved.immersve_api_key, (value) => {
    config.immersveApiKey = value;
    config.keySource = 'saved';
  });
  fillSaved(env.IMMERSVE_API_SECRET, saved.immersve_api_secret, (value) => {
    config.immersveApiSecret = value;
  });
  fillSaved(env.IMMERSVE_CLIENT_APPLICATION_ID, saved.immersve_client_application_id, (value) => {
    config.immersveClientApplicationId = value;
  });
  fillSaved(env.IMMERSVE_PARTNER_ACCOUNT_ID, saved.immersve_partner_account_id, (value) => {
    config.immersvePartnerAccountId = value;
  });
  fillSaved(env.IMMERSVE_CARD_PROGRAM_ID, saved.immersve_card_program_id, (value) => {
    config.immersveCardProgramId = value;
  });
  fillSaved(env.IMMERSVE_FUNDING_CHANNEL_ID, saved.immersve_funding_channel_id, (value) => {
    config.immersveFundingChannelId = value;
  });
  fillSaved(env.IMMERSVE_FUNDS_STORAGE_ADDRESS, saved.immersve_funds_storage_address, (value) => {
    if (isAddress(value)) config.immersveFundsStorageAddress = value.toLowerCase();
  });
  fillSaved(env.IMMERSVE_FUNDING_TYPE_NAME, saved.immersve_funding_type_name, (value) => {
    config.immersveFundingTypeName = value;
  });
  fillSaved(env.IMMERSVE_CLIENT_ORIGIN, saved.immersve_client_origin, (value) => {
    config.immersveClientOrigin = value.replace(/\/$/, '');
  });
  fillSaved(env.IMMERSVE_NETWORK, saved.immersve_network, (value) => {
    config.immersveNetwork = value;
  });
  if (!env.TREASURY_ADDRESS?.trim() && saved.treasury_address && isAddress(saved.treasury_address)) {
    config.treasuryAddress = saved.treasury_address.toLowerCase();
  }
  if (!config.treasuryAddress && config.immersveFundsStorageAddress) {
    config.treasuryAddress = config.immersveFundsStorageAddress;
  }
  fillSaved(env.PAY2_API_KEY, saved.pay2_api_key, (value) => {
    config.pay2ApiKey = value;
  });
  fillSaved(env.PAY2_KEY_ID, saved.pay2_key_id, (value) => {
    config.pay2KeyId = value;
  });
  fillSaved(env.PAY2_PRIVATE_KEY_PEM, saved.pay2_private_key_pem, (value) => {
    config.pay2PrivateKeyPem = value.replace(/\\n/g, '\n');
  });
  fillSaved(env.PAY2_ACCOUNT_NUMBER, saved.pay2_account_number, (value) => {
    config.pay2AccountNumber = value;
  });
  fillSaved(env.PAY2_BIN_NUMBER, saved.pay2_bin_number, (value) => {
    config.pay2BinNumber = value;
  });
  config.livemode = isLiveImmersveKey(config.immersveApiKey, config.immersveApiSecret);
  config.pay2Ready = Boolean(
    config.pay2ApiKey && config.pay2KeyId && config.pay2PrivateKeyPem && config.pay2AccountNumber,
  );
}

export function readiness(config: Config): ReadinessItem[] {
  const live = config.livemode;
  const pay2 = config.pay2Ready;
  const canIssue = live || pay2;
  const visa = Boolean(config.visaApiKey && config.visaSharedSecret);
  const issuerDetail = live
    ? 'Live Immersve keys are connected. Immersve issues the Mastercard and checks the on-chain deposit before a merchant charge.'
    : isTestImmersveKey(config.immersveApiKey, config.immersveApiSecret)
      ? 'A test key is present. Replace it with the live Immersve key pair. Test keys cannot be spent at a merchant or added to Apple Pay.'
      : 'Connect the live Immersve API key, API secret, partner account, card program, and funding channel. That account issues the card.';
  return [
    {
      id: 'pay2_issuer',
      ready: pay2,
      title: 'Pay2.House cards (issue today)',
      detail: pay2
        ? `Pay2.House is connected on account ${config.pay2AccountNumber}. Issue a client card from the desk after the Pay2 wallet has balance.`
        : 'Sign up at pay2.house, create an API key at /keys/prepare, fund a USD wallet (USDT TRC20), then paste API key, key id, private key PEM, account number, and BIN here.',
    },
    {
      id: 'card_issuer',
      ready: live,
      title: 'Immersve card issuing',
      detail: issuerDetail,
    },
    {
      id: 'treasury',
      ready: canIssue,
      title: 'Card funding',
      detail: pay2
        ? 'Fund the Pay2.House USD wallet (USDT TRC20 address from wallets), then top up each issued card from that account.'
        : live
          ? config.immersveFundsStorageAddress
            ? `Universal EVM Funds Storage is ${config.immersveFundsStorageAddress}. Send the funded ERC-20 there from the linked wallet after the Funding Source exists.`
            : 'After the card is issued, send the funded ERC-20 to the Immersve Funds Storage / deposit address shown on the quote.'
          : 'Connect Pay2.House to issue today, or Immersve Universal EVM for wallet-native funding.',
    },
    {
      id: 'prices',
      ready: true,
      title: 'DefiLlama prices',
      detail:
        'Each contract is priced with coins.llama.fi/prices/current using chain:address. Catalog stablecoins use one dollar when the feed is within a cent of the peg.',
    },
    {
      id: 'apple_pay',
      ready: canIssue,
      title: 'Apple Pay',
      detail: pay2
        ? 'Show the card number, then on iPhone open Wallet → + → Debit or Credit Card → Enter Card Details Manually.'
        : 'The iPhone app uses PassKit and POST /api/wallets/apple. Immersve returns encryptedPassData, ephemeralPublicKey, and activationData. Apple Pay is added in the app, and only with live keys.',
    },
    {
      id: 'google_pay',
      ready: canIssue,
      title: 'Google Pay',
      detail:
        'Show the card number on this page and type it into Google Wallet. Push provisioning is not required for manual add.',
    },
    {
      id: 'samsung_pay',
      ready: canIssue,
      title: 'Samsung Pay',
      detail: visa
        ? 'Type the card from the secure link into Samsung Wallet, or push with Visa when a vCardID is attached.'
        : 'Show the card number and type it into Samsung Wallet.',
    },
    {
      id: 'identity',
      ready: canIssue,
      title: 'Cardholder checks',
      detail: live
        ? 'Immersve runs identity checks before the card is created. The page opens their secure check when it is still required.'
        : 'Identity checks run at Immersve after the live keys are connected.',
    },
  ];
}
