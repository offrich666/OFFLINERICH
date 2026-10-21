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
  return {
    port: integer(env.PORT, 8787),
    databasePath: env.DATABASE_PATH?.trim() || './data/offlinerich.sqlite',
    immersveApiKey,
    immersveApiSecret,
    immersveClientApplicationId: env.IMMERSVE_CLIENT_APPLICATION_ID?.trim() ?? '',
    immersvePartnerAccountId: env.IMMERSVE_PARTNER_ACCOUNT_ID?.trim() ?? '',
    immersveCardProgramId: env.IMMERSVE_CARD_PROGRAM_ID?.trim() ?? '',
    immersveFundingChannelId: env.IMMERSVE_FUNDING_CHANNEL_ID?.trim() ?? '',
    immersveClientOrigin: (env.IMMERSVE_CLIENT_ORIGIN?.trim() || 'https://localhost').replace(/\/$/, ''),
    immersveNetwork: env.IMMERSVE_NETWORK?.trim() || 'ethereum-mainnet',
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
  fillSaved(env.IMMERSVE_CLIENT_ORIGIN, saved.immersve_client_origin, (value) => {
    config.immersveClientOrigin = value.replace(/\/$/, '');
  });
  fillSaved(env.IMMERSVE_NETWORK, saved.immersve_network, (value) => {
    config.immersveNetwork = value;
  });
  if (!env.TREASURY_ADDRESS?.trim() && saved.treasury_address && isAddress(saved.treasury_address)) {
    config.treasuryAddress = saved.treasury_address.toLowerCase();
  }
  config.livemode = isLiveImmersveKey(config.immersveApiKey, config.immersveApiSecret);
}

export function readiness(config: Config): ReadinessItem[] {
  const live = config.livemode;
  const visa = Boolean(config.visaApiKey && config.visaSharedSecret);
  const issuerDetail = live
    ? 'Live Immersve keys are connected. Immersve issues the Mastercard and checks the on-chain deposit before a merchant charge.'
    : isTestImmersveKey(config.immersveApiKey, config.immersveApiSecret)
      ? 'A test key is present. Replace it with the live Immersve key pair. Test keys cannot be spent at a merchant or added to Apple Pay.'
      : 'Connect the live Immersve API key, API secret, partner account, card program, and funding channel. That account issues the card.';
  return [
    {
      id: 'card_issuer',
      ready: live,
      title: 'Immersve card issuing',
      detail: issuerDetail,
    },
    {
      id: 'treasury',
      ready: live,
      title: 'On-chain card funding',
      detail: live
        ? 'After the card is issued, send the token to the Immersve deposit contract shown on the quote. The spendable balance follows that deposit.'
        : 'The deposit contract appears after the live card is issued. This server never holds the wallet key.',
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
      ready: live,
      title: 'Apple Pay',
      detail:
        'The iPhone app uses PassKit and POST /api/wallets/apple. Immersve returns encryptedPassData, ephemeralPublicKey, and activationData. Apple Pay is added in the app, and only with live keys.',
    },
    {
      id: 'google_pay',
      ready: live,
      title: 'Google Pay',
      detail:
        'Open the one-time secure card link from this page and type the card into Google Wallet. Immersve push provisioning for Google Pay is not available yet.',
    },
    {
      id: 'samsung_pay',
      ready: live,
      title: 'Samsung Pay',
      detail: visa
        ? 'Type the card from the secure link into Samsung Wallet, or push with Visa when a vCardID is attached.'
        : 'Open the one-time secure card link and type the card into Samsung Wallet. Immersve does not push to Samsung Pay.',
    },
    {
      id: 'identity',
      ready: live,
      title: 'Cardholder checks',
      detail: live
        ? 'Immersve runs identity checks before the card is created. The page opens their secure check when it is still required.'
        : 'Identity checks run at Immersve after the live keys are connected.',
    },
  ];
}
