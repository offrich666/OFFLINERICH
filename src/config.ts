import { isAddress } from './abi.ts';
import { CHAINS } from './chains.ts';

export type ReadinessItem = {
  id: string;
  ready: boolean;
  title: string;
  detail: string;
};

export type Config = {
  port: number;
  databasePath: string;
  stripeSecretKey: string;
  stripePublishableKey: string;
  stripeWebhookSecret: string;
  stripeApiVersion: string;
  livemode: boolean;
  treasuryAddress: string | null;
  feeBps: number;
  minTopupCents: number;
  maxTopupCents: number;
  blockedCountries: string[];
  allowSimulatedTopups: boolean;
  simulatePurchases: boolean;
  visaApiKey: string;
  visaSharedSecret: string;
  visaApiBase: string;
  visaCertPath: string;
  visaKeyPath: string;
  cardBin: string;
  operatorToken: string;
  secureCookies: boolean;
  trustProxy: boolean;
  rpcUrls: Record<number, string>;
};

export type Env = Record<string, string | undefined>;

function integer(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(env: Env): Config {
  const stripeSecretKey = env.STRIPE_SECRET_KEY?.trim() ?? '';
  const livemode = stripeSecretKey.startsWith('sk_live') || stripeSecretKey.startsWith('rk_live');
  const treasuryRaw = env.TREASURY_ADDRESS?.trim() ?? '';
  if (treasuryRaw && !isAddress(treasuryRaw)) {
    throw new Error('TREASURY_ADDRESS must be a 0x wallet address.');
  }
  const treasuryAddress = treasuryRaw ? treasuryRaw.toLowerCase() : null;
  let allowSimulatedTopups = env.ALLOW_SIMULATED_TOPUPS
    ? env.ALLOW_SIMULATED_TOPUPS === 'true'
    : !treasuryAddress;
  if (livemode) allowSimulatedTopups = false;
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
    stripeSecretKey,
    stripePublishableKey: env.STRIPE_PUBLISHABLE_KEY?.trim() ?? '',
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET?.trim() ?? '',
    stripeApiVersion: env.STRIPE_API_VERSION?.trim() || '2026-09-30.endive',
    livemode,
    treasuryAddress,
    feeBps,
    minTopupCents: Math.max(1, integer(env.MIN_TOPUP_CENTS, 100)),
    maxTopupCents: Math.max(1, integer(env.MAX_TOPUP_CENTS, 5_000_000)),
    blockedCountries: (env.BLOCKED_MERCHANT_COUNTRIES ?? '')
      .split(',')
      .map((country) => country.trim().toUpperCase())
      .filter((country) => /^[A-Z]{2}$/.test(country)),
    allowSimulatedTopups,
    simulatePurchases: !livemode,
    visaApiKey: env.VISA_API_KEY?.trim() ?? '',
    visaSharedSecret: env.VISA_SHARED_SECRET?.trim() ?? '',
    visaApiBase: (env.VISA_API_BASE?.trim() || 'https://sandbox.api.visa.com').replace(/\/$/, ''),
    visaCertPath: env.VISA_CERT_PATH?.trim() ?? '',
    visaKeyPath: env.VISA_KEY_PATH?.trim() ?? '',
    cardBin: /^\d{6,8}$/.test(cardBin) ? cardBin : '',
    operatorToken: env.OPERATOR_TOKEN?.trim() ?? '',
    secureCookies: env.SECURE_COOKIES === 'true',
    trustProxy: env.TRUST_PROXY === 'true',
    rpcUrls,
  };
}

export function readiness(config: Config): ReadinessItem[] {
  const stripe = Boolean(config.stripeSecretKey);
  const publishable = Boolean(config.stripePublishableKey);
  const visa = Boolean(config.visaApiKey && config.visaSharedSecret);
  return [
    {
      id: 'stripe_issuing',
      ready: stripe,
      title: 'Stripe Issuing',
      detail: stripe
        ? config.livemode
          ? 'Live secret key connected. Stripe Issuing creates the cardholder, the card, and the spending limit.'
          : 'Test secret key connected. Stripe will issue sandbox cards you can rehearse in the dashboard.'
        : 'Set STRIPE_SECRET_KEY. Stripe Issuing creates the cardholder, the virtual or physical card, and the spending limit.',
    },
    {
      id: 'stripe_elements',
      ready: publishable && stripe,
      title: 'Card number and wallet buttons',
      detail:
        publishable && stripe
          ? 'Stripe.js can show the card number in a Stripe frame and mount Add to Apple Pay and Add to Google Pay.'
          : 'Set STRIPE_PUBLISHABLE_KEY next to the secret key. The browser uses Stripe.js Issuing Elements.',
    },
    {
      id: 'treasury',
      ready: Boolean(config.treasuryAddress),
      title: 'Token treasury',
      detail: config.treasuryAddress
        ? `Send ERC-20 top-ups to ${config.treasuryAddress}. Fund the Stripe Issuing balance with the USD value that lands.`
        : 'Set TREASURY_ADDRESS to the wallet that receives token top-ups. The server stores the address and never the key.',
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
      ready: stripe && publishable,
      title: 'Apple Pay',
      detail:
        'Web: Stripe element issuingAddToWalletButton with wallet apple. iPhone app: PassKit PKAddPaymentPassViewController and STPPushProvisioningContext, which calls POST /api/wallets/ephemeral-key. Apple approves the wallet from the Stripe Issuing settings.',
    },
    {
      id: 'google_pay',
      ready: stripe && publishable,
      title: 'Google Pay',
      detail:
        'Web: issuingAddToWalletButton with wallet google. Android: stripe-android-issuing-push-provisioning 1.3.0 and TapAndPay 18.8.0. In Google Issuer Console, link to Stripe aggregator BCR2DN7TWDCZDZJC.',
    },
    {
      id: 'samsung_pay',
      ready: stripe,
      title: 'Samsung Pay',
      detail: visa
        ? 'Manual add uses the code Stripe sends to the cardholder phone or email. Push calls Visa POST /inapp/provisioning/cardData/samsungPay and returns opaquePaymentCard for Samsung CardManager.addCard.'
        : 'Manual add uses the code Stripe sends to the cardholder phone or email. Push also needs VISA_API_KEY, VISA_SHARED_SECRET, and a vCardID attached with the operator endpoint. Stripe’s mobile SDK does not push to Samsung Pay.',
    },
    {
      id: 'webhook',
      ready: Boolean(config.stripeWebhookSecret),
      title: 'Real-time authorizations',
      detail: config.stripeWebhookSecret
        ? 'Stripe can call POST /api/webhooks/stripe. A charge is approved when the token balance covers the USD amount.'
        : 'Set STRIPE_WEBHOOK_SECRET and point Issuing real-time authorizations at POST /api/webhooks/stripe.',
    },
  ];
}
