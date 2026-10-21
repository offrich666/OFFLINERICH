import { timingSafeEqual } from 'node:crypto';
import { decodeTransfers, isAddress, receiptSucceeded } from './abi.ts';
import { CATALOG, chainById, findCatalog, findCatalogById, type CatalogToken } from './chains.ts';
import type { Config } from './config.ts';
import { readErc20, type RpcClient } from './erc20.ts';
import { HttpError } from './errors.ts';
import type { CardIssuer } from './issuer.ts';
import { id, secretToken } from './ids.ts';
import {
  decideSpend,
  formatUsd,
  isAtLeast18,
  normalizePhone,
  parseDecimalToRaw,
  settlePrice,
  spendMessage,
  usdCents,
  validDate,
} from './money.ts';
import { hashPassword, verifyPassword } from './passwords.ts';
import type { PriceClient } from './prices.ts';
import { linkMessage, signatureMatches } from './signature.ts';
import type { CardRow, Store } from './store.ts';
import { requestSamsungCardData } from './visa.ts';

export type Ctx = {
  config: Config;
  store: Store;
  rpc: RpcClient;
  prices: PriceClient;
  issuer: CardIssuer;
  now: () => number;
};

type KnownToken = CatalogToken & { source: 'catalog' | 'custom' };

const MANUAL_STEPS = [
  'Open Apple Pay, Google Pay, or Samsung Wallet and choose add card.',
  'Enter the card number shown in the Stripe card frame on this page.',
  'Enter the 6-digit code Stripe sends to the cardholder phone or email.',
];

function tokenView(token: KnownToken, chainName: string, explorer: string) {
  return {
    id: token.id,
    chainId: token.chainId,
    chainName,
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    source: token.source,
    pegged: token.pegged,
    explorerUrl: `${explorer}/token/${token.address}`,
  };
}

function knownFromCatalog(token: CatalogToken): KnownToken {
  return { ...token, source: 'catalog' };
}

function resolveToken(ctx: Ctx, userId: string, tokenId: string): KnownToken {
  const catalog = findCatalogById(tokenId);
  if (catalog) return knownFromCatalog(catalog);
  const custom = ctx.store.getCustomToken(userId, tokenId);
  if (!custom) throw new HttpError(404, 'token_not_found', 'That token is not on this account.');
  return {
    id: custom.id,
    chainId: custom.chainId,
    address: custom.address,
    symbol: custom.symbol,
    name: custom.name,
    decimals: custom.decimals,
    pegged: false,
    source: 'custom',
  };
}

function priceId(token: KnownToken): string {
  const chain = chainById(token.chainId);
  if (!chain) throw new HttpError(400, 'unknown_chain', 'That chain is not supported.');
  return `${chain.key}:${token.address}`;
}

async function priceFor(ctx: Ctx, token: KnownToken): Promise<number> {
  const quotes = await ctx.prices.getMany([priceId(token)]);
  const price = settlePrice(token.pegged, quotes[priceId(token)] ?? null);
  if (price == null) {
    throw new HttpError(
      400,
      'no_price',
      'A published USD price is required before this contract can fund the card.',
    );
  }
  return price;
}

function requireCard(ctx: Ctx, userId: string): CardRow {
  const card = ctx.store.getCardByUser(userId);
  if (!card) throw new HttpError(409, 'card_required', 'Issue the card before this step.');
  return card;
}

function publicCard(card: CardRow) {
  return {
    id: card.id,
    type: card.type,
    status: card.status,
    brand: card.brand,
    last4: card.last4,
    expMonth: card.expMonth,
    expYear: card.expYear,
    currency: card.currency,
    issuerMode: card.issuerMode,
    issuerCardId: card.issuerCardId,
    spendingLimitCents: card.spendingLimitCents,
    syncError: card.syncError,
    hasNetworkRef: Boolean(card.vCardId),
  };
}

function refreshLocalStatus(ctx: Ctx, card: CardRow): CardRow {
  const balance = ctx.store.getBalance(card.userId);
  const status = balance.available > 0 ? 'active' : 'inactive';
  const limit = Math.max(balance.credits, 1);
  ctx.store.updateCardRuntime(card.id, status, limit, card.syncError);
  return { ...card, status, spendingLimitCents: limit };
}

export async function syncCard(ctx: Ctx, userId: string): Promise<{ ok: boolean; message: string }> {
  const existing = ctx.store.getCardByUser(userId);
  if (!existing) return { ok: true, message: 'Issue a card and the spending limit will follow the token balance.' };
  const card = refreshLocalStatus(ctx, existing);
  if (card.issuerMode !== 'stripe') return { ok: true, message: 'Simulator card limit updated.' };
  try {
    await ctx.issuer.updateCard(card.issuerCardId, {
      status: card.status === 'active' ? 'active' : 'inactive',
      spendingLimitCents: card.spendingLimitCents,
    });
    ctx.store.updateCardRuntime(card.id, card.status, card.spendingLimitCents, '');
    return { ok: true, message: 'Stripe spending limit updated.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stripe spending limit update failed.';
    ctx.store.updateCardRuntime(card.id, card.status, card.spendingLimitCents, message);
    return { ok: false, message };
  }
}

export async function register(ctx: Ctx, input: { email?: string; password?: string }) {
  const email = (input.email ?? '').trim().toLowerCase();
  const password = input.password ?? '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    throw new HttpError(400, 'invalid_email', 'Enter a valid email.');
  }
  if (password.length < 8 || password.length > 200) {
    throw new HttpError(400, 'invalid_password', 'Use a password of at least 8 characters.');
  }
  if (ctx.store.getUserByEmail(email)) {
    throw new HttpError(409, 'email_taken', 'An account with that email already exists. Sign in instead.');
  }
  const userId = id('usr_');
  const createdAt = ctx.now();
  ctx.store.createUser({ id: userId, email, passwordHash: await hashPassword(password), createdAt });
  const token = secretToken();
  ctx.store.createSession(token, userId, createdAt);
  return { token, user: { id: userId, email } };
}

export async function login(ctx: Ctx, input: { email?: string; password?: string }) {
  const email = (input.email ?? '').trim().toLowerCase();
  const password = input.password ?? '';
  const user = ctx.store.getUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new HttpError(401, 'invalid_login', 'Email or password is incorrect.');
  }
  const token = secretToken();
  ctx.store.createSession(token, user.id, ctx.now());
  return { token, user: { id: user.id, email: user.email } };
}

export function logout(ctx: Ctx, token: string): void {
  if (token) ctx.store.deleteSession(token);
}

export function me(ctx: Ctx, userId: string) {
  const user = ctx.store.getUser(userId);
  if (!user) throw new HttpError(401, 'auth_required', 'Sign in to continue.');
  const cardholder = ctx.store.getCardholder(userId);
  const card = ctx.store.getCardByUser(userId);
  const wallet = ctx.store.getWallet(userId);
  const balance = ctx.store.getBalance(userId);
  return {
    user: { id: user.id, email: user.email },
    wallet: wallet ? { address: wallet.address } : null,
    cardholder: cardholder
      ? {
          firstName: cardholder.firstName,
          lastName: cardholder.lastName,
          email: cardholder.email,
          phone: cardholder.phone,
          country: cardholder.country,
        }
      : null,
    card: card ? publicCard(card) : null,
    balance: {
      availableCents: balance.available,
      creditedCents: balance.credits,
      debitedCents: balance.debits,
      currency: 'usd',
    },
  };
}

export async function listTokens(ctx: Ctx, userId: string) {
  const custom: KnownToken[] = ctx.store.listCustomTokens(userId).map((row) => ({
    id: row.id,
    chainId: row.chainId,
    address: row.address,
    symbol: row.symbol,
    name: row.name,
    decimals: row.decimals,
    pegged: false,
    source: 'custom',
  }));
  const tokens = [...CATALOG.map(knownFromCatalog), ...custom];
  const quotes = await ctx.prices.getMany(tokens.map(priceId));
  return {
    tokens: tokens.map((token) => {
      const chain = chainById(token.chainId);
      const quote = quotes[priceId(token)] ?? null;
      return {
        ...tokenView(token, chain?.name ?? 'Unknown', chain?.explorer ?? ''),
        priceUsd: settlePrice(token.pegged, quote),
        confidence: quote?.confidence ?? null,
      };
    }),
  };
}

export async function addToken(ctx: Ctx, userId: string, input: { chainId?: number; address?: string }) {
  const chain = chainById(Number(input.chainId));
  if (!chain) throw new HttpError(400, 'unknown_chain', 'Choose a supported chain.');
  const address = (input.address ?? '').trim();
  if (!isAddress(address)) {
    throw new HttpError(400, 'invalid_address', 'Enter a contract address (0x and 40 hex characters).');
  }
  const normalized = address.toLowerCase();
  const catalog = findCatalog(chain.id, normalized);
  if (catalog) return { token: { ...knownFromCatalog(catalog), chainName: chain.name }, created: false };
  const existing = ctx.store.listCustomTokens(userId).find((row) => row.chainId === chain.id && row.address === normalized);
  if (existing) {
    return {
      token: { ...existing, source: 'custom' as const, pegged: false, chainName: chain.name },
      created: false,
    };
  }
  const meta = await readErc20(ctx.rpc, chain.id, normalized);
  const row = {
    id: id('tok_'),
    userId,
    chainId: chain.id,
    address: normalized,
    symbol: meta.symbol,
    name: meta.name,
    decimals: meta.decimals,
    createdAt: ctx.now(),
  };
  ctx.store.insertCustomToken(row);
  return { token: { ...row, source: 'custom' as const, pegged: false, chainName: chain.name }, created: true };
}

export async function quoteTopup(ctx: Ctx, userId: string, input: { tokenId?: string; amount?: string }) {
  const token = resolveToken(ctx, userId, input.tokenId ?? '');
  let raw: bigint;
  try {
    raw = parseDecimalToRaw(input.amount ?? '', token.decimals);
  } catch (error) {
    throw new HttpError(400, 'invalid_amount', error instanceof Error ? error.message : 'Enter a token amount.');
  }
  const price = await priceFor(ctx, token);
  const money = usdCents(raw, token.decimals, price, ctx.config.feeBps);
  const chain = chainById(token.chainId);
  return {
    tokenId: token.id,
    symbol: token.symbol,
    chainId: token.chainId,
    chainName: chain?.name ?? '',
    amount: input.amount,
    priceUsd: price,
    grossCents: money.grossCents,
    feeCents: money.feeCents,
    netCents: money.netCents,
    feeBps: ctx.config.feeBps,
    treasuryAddress: ctx.config.treasuryAddress,
    simulatedTopups: ctx.config.allowSimulatedTopups,
    minimumCents: ctx.config.minTopupCents,
  };
}

function assertTopupSize(ctx: Ctx, netCents: number): void {
  if (netCents < ctx.config.minTopupCents) {
    throw new HttpError(
      400,
      'amount_too_small',
      `Send enough of the token to credit at least ${formatUsd(ctx.config.minTopupCents)} after fees.`,
    );
  }
  if (netCents > ctx.config.maxTopupCents) {
    throw new HttpError(400, 'amount_too_large', `A single top-up can credit up to ${formatUsd(ctx.config.maxTopupCents)}.`);
  }
}

function credit(ctx: Ctx, input: {
  userId: string;
  token: KnownToken;
  txHash: string;
  logIndex: number;
  amountRaw: bigint;
  price: number;
  netCents: number;
  depositSource: 'chain' | 'simulated';
}): void {
  const depositId = id('dep_');
  const card = ctx.store.getCardByUser(input.userId);
  ctx.store.insertDeposit({
    id: depositId,
    userId: input.userId,
    tokenKey: input.token.id,
    chainId: input.token.chainId,
    tokenAddress: input.token.address,
    symbol: input.token.symbol,
    txHash: input.txHash,
    logIndex: input.logIndex,
    amountRaw: input.amountRaw.toString(),
    priceUsd: String(input.price),
    creditedCents: input.netCents,
    depositSource: input.depositSource,
    createdAt: ctx.now(),
  });
  ctx.store.insertLedger({
    id: id('led_'),
    userId: input.userId,
    cardId: card?.id ?? '',
    direction: 'credit',
    amountCents: input.netCents,
    kind: input.depositSource === 'simulated' ? 'topup_simulated' : 'topup',
    ref: `deposit:${input.txHash}:${input.logIndex}`,
    memo: input.token.symbol,
    createdAt: ctx.now(),
  });
}

export async function confirmTopup(ctx: Ctx, userId: string, input: { tokenId?: string; txHash?: string }) {
  if (!ctx.config.treasuryAddress) {
    throw new HttpError(400, 'treasury_unset', 'Set TREASURY_ADDRESS to the wallet that should receive token deposits.');
  }
  const wallet = ctx.store.getWallet(userId);
  if (!wallet) throw new HttpError(400, 'wallet_unlinked', 'Link the wallet you will send tokens from.');
  const token = resolveToken(ctx, userId, input.tokenId ?? '');
  const txHash = (input.txHash ?? '').trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(txHash)) {
    throw new HttpError(400, 'invalid_tx', 'Enter the transfer transaction hash.');
  }
  let receipt: unknown;
  try {
    receipt = await ctx.rpc.call(token.chainId, 'eth_getTransactionReceipt', [txHash]);
  } catch {
    throw new HttpError(502, 'chain_unavailable', 'Could not read that transaction from the chain.');
  }
  if (!receipt || typeof receipt !== 'object') {
    throw new HttpError(400, 'tx_not_found', 'That transaction is not on this chain yet.');
  }
  const record = receipt as { status?: unknown; logs?: [] };
  if (!receiptSucceeded(record.status)) {
    throw new HttpError(400, 'tx_failed', 'That transaction failed on-chain.');
  }
  const transfers = decodeTransfers(record, token.address).filter(
    (transfer) => transfer.to === ctx.config.treasuryAddress && transfer.from === wallet.address,
  );
  if (transfers.length === 0) {
    throw new HttpError(
      400,
      'transfer_not_found',
      'No transfer of this token from your linked wallet to the treasury was found in that transaction.',
    );
  }
  const price = await priceFor(ctx, token);
  const plan: Array<{ logIndex: number; amount: bigint; netCents: number; existing: boolean }> = [];
  for (const transfer of transfers) {
    const existing = ctx.store.findDeposit(txHash, transfer.logIndex);
    if (existing) {
      if (existing.userId !== userId) {
        throw new HttpError(409, 'deposit_used', 'That transfer was already credited to another account.');
      }
      plan.push({ logIndex: transfer.logIndex, amount: transfer.amount, netCents: existing.creditedCents, existing: true });
      continue;
    }
    const money = usdCents(transfer.amount, token.decimals, price, ctx.config.feeBps);
    assertTopupSize(ctx, money.netCents);
    plan.push({ logIndex: transfer.logIndex, amount: transfer.amount, netCents: money.netCents, existing: false });
  }
  const fresh = plan.filter((item) => !item.existing);
  if (fresh.length > 0) {
    ctx.store.transaction(() => {
      for (const item of fresh) {
        if (ctx.store.findDeposit(txHash, item.logIndex)) continue;
        credit(ctx, {
          userId,
          token,
          txHash,
          logIndex: item.logIndex,
          amountRaw: item.amount,
          price,
          netCents: item.netCents,
          depositSource: 'chain',
        });
      }
    });
  }
  const sync = await syncCard(ctx, userId);
  const creditedCents = fresh.reduce((sum, item) => sum + item.netCents, 0);
  return {
    creditedCents,
    alreadyCredited: fresh.length === 0,
    priceUsd: price,
    balance: ctx.store.getBalance(userId),
    sync,
  };
}

export async function simulateTopup(ctx: Ctx, userId: string, input: { tokenId?: string; amount?: string }) {
  if (!ctx.config.allowSimulatedTopups) {
    throw new HttpError(403, 'simulation_disabled', 'Simulated top-ups are off. Send the token to the treasury instead.');
  }
  const quoted = await quoteTopup(ctx, userId, input);
  assertTopupSize(ctx, quoted.netCents);
  const token = resolveToken(ctx, userId, quoted.tokenId);
  const raw = parseDecimalToRaw(input.amount ?? '', token.decimals);
  const txHash = `sim_${id('')}`;
  ctx.store.transaction(() => {
    credit(ctx, {
      userId,
      token,
      txHash,
      logIndex: 0,
      amountRaw: raw,
      price: quoted.priceUsd,
      netCents: quoted.netCents,
      depositSource: 'simulated',
    });
  });
  const sync = await syncCard(ctx, userId);
  return {
    creditedCents: quoted.netCents,
    priceUsd: quoted.priceUsd,
    balance: ctx.store.getBalance(userId),
    simulated: true,
    sync,
  };
}

export function walletMessage(ctx: Ctx, userId: string, addressRaw: string) {
  if (!isAddress(addressRaw ?? '')) {
    throw new HttpError(400, 'invalid_address', 'Enter the wallet address that will send the tokens.');
  }
  const address = addressRaw.trim().toLowerCase();
  const nonce = secretToken();
  ctx.store.setNonce(userId, nonce);
  return { address, message: linkMessage({ address, userId, nonce }) };
}

export async function linkWallet(ctx: Ctx, userId: string, input: { address?: string; signature?: string }) {
  if (!isAddress(input.address ?? '')) {
    throw new HttpError(400, 'invalid_address', 'Enter the wallet address that will send the tokens.');
  }
  const address = (input.address ?? '').trim().toLowerCase();
  const nonce = ctx.store.getNonce(userId);
  if (!nonce) throw new HttpError(400, 'nonce_required', 'Request a link message, sign it, and submit the signature.');
  const message = linkMessage({ address, userId, nonce });
  const matches = await signatureMatches(address, message, input.signature ?? '');
  if (!matches) throw new HttpError(400, 'bad_signature', 'That signature does not match this account and wallet.');
  const owner = ctx.store.walletOwner(address);
  if (owner && owner !== userId) {
    throw new HttpError(409, 'wallet_taken', 'That wallet is already linked to another account.');
  }
  ctx.store.saveWallet(userId, address, ctx.now());
  ctx.store.setNonce(userId, secretToken());
  return { address };
}

function printedName(first: string, last: string): string {
  const name = `${first} ${last}`.trim().replace(/\s+/g, ' ');
  if (!/^[A-Za-z][A-Za-z '\-]*$/.test(name)) {
    throw new HttpError(400, 'invalid_name', 'Use letters for the name printed on the card.');
  }
  if (name.length > 24) throw new HttpError(400, 'invalid_name', 'The printed name must be 24 characters or fewer.');
  return name;
}

export async function issueCard(
  ctx: Ctx,
  userId: string,
  input: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    dob?: string;
    line1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    type?: string;
    acceptedTerms?: boolean;
  },
  termsIp: string,
) {
  if (ctx.store.getCardByUser(userId)) {
    throw new HttpError(409, 'card_exists', 'This account already has a card.');
  }
  if (input.acceptedTerms !== true) {
    throw new HttpError(400, 'terms_required', 'Accept the cardholder terms to issue the card.');
  }
  const firstName = (input.firstName ?? '').trim();
  const lastName = (input.lastName ?? '').trim();
  const name = printedName(firstName, lastName);
  const email = (input.email ?? '').trim();
  const phone = normalizePhone(input.phone ?? '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'invalid_email', 'Enter the email for wallet codes.');
  if (!phone) {
    throw new HttpError(400, 'invalid_phone', 'Enter a phone number with country code, such as +1 800 555 0100.');
  }
  const dobMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.dob ?? '');
  if (!dobMatch) throw new HttpError(400, 'invalid_dob', 'Enter a birth date.');
  const dobYear = Number(dobMatch[1]);
  const dobMonth = Number(dobMatch[2]);
  const dobDay = Number(dobMatch[3]);
  if (!validDate(dobYear, dobMonth, dobDay) || !isAtLeast18(dobYear, dobMonth, dobDay, new Date(ctx.now()))) {
    throw new HttpError(400, 'invalid_dob', 'The cardholder needs to be 18 or older.');
  }
  const line1 = (input.line1 ?? '').trim();
  const city = (input.city ?? '').trim();
  const state = (input.state ?? '').trim();
  const postalCode = (input.postalCode ?? '').trim();
  const country = (input.country ?? '').trim().toUpperCase();
  if (line1.length < 2 || city.length < 1 || state.length < 1 || postalCode.length < 2) {
    throw new HttpError(400, 'invalid_address', 'Enter the billing address for the card.');
  }
  if (!/^[A-Z]{2}$/.test(country)) throw new HttpError(400, 'invalid_country', 'Enter the country as two letters, such as US.');
  const type = input.type === 'physical' ? 'physical' : 'virtual';
  const existing = ctx.store.getCardholder(userId);
  let issuerCardholderId = existing && existing.issuerMode === ctx.issuer.mode ? existing.issuerCardholderId : '';
  const termsAcceptedAt = ctx.now();
  if (!issuerCardholderId) {
    const created = await ctx.issuer.createCardholder({
      name,
      email,
      phone,
      firstName,
      lastName,
      dobDay,
      dobMonth,
      dobYear,
      line1,
      city,
      state,
      postalCode,
      country,
      termsAcceptedAt,
      termsIp: termsIp || '127.0.0.1',
    });
    issuerCardholderId = created.id;
  }
  ctx.store.saveCardholder({
    userId,
    firstName,
    lastName,
    email,
    phone,
    dobDay,
    dobMonth,
    dobYear,
    line1,
    city,
    state,
    postalCode,
    country,
    termsAcceptedAt,
    termsIp: termsIp || '127.0.0.1',
    issuerCardholderId,
    issuerMode: ctx.issuer.mode,
    createdAt: existing?.createdAt ?? termsAcceptedAt,
  });
  const balance = ctx.store.getBalance(userId);
  const issued = await ctx.issuer.createCard({
    cardholderId: issuerCardholderId,
    type,
    currency: 'usd',
    status: 'inactive',
    spendingLimitCents: Math.max(balance.credits, 1),
    shipping:
      type === 'physical'
        ? { name, line1, city, state, postalCode, country }
        : undefined,
  });
  const cardId = id('card_');
  ctx.store.insertCard({
    id: cardId,
    userId,
    issuerCardId: issued.id,
    issuerMode: ctx.issuer.mode,
    type,
    currency: 'usd',
    status: 'inactive',
    brand: issued.brand,
    last4: issued.last4,
    expMonth: issued.expMonth,
    expYear: issued.expYear,
    vCardId: '',
    spendingLimitCents: Math.max(balance.credits, 1),
    syncError: '',
    createdAt: ctx.now(),
  });
  const sync = await syncCard(ctx, userId);
  const card = ctx.store.getCardByUser(userId);
  return { card: card ? publicCard(card) : null, sync };
}

function applySpend(
  ctx: Ctx,
  card: CardRow,
  input: { authId: string; amountCents: number; merchantName: string; merchantCountry: string },
): { approved: boolean; reason: string } {
  const existing = ctx.store.getAuthorization(input.authId);
  if (existing) return { approved: existing.approved, reason: existing.reason };
  let decision = { approved: false, reason: 'invalid_amount' };
  try {
    ctx.store.transaction(() => {
    const prior = ctx.store.getAuthorization(input.authId);
    if (prior) {
      decision = { approved: prior.approved, reason: prior.reason };
      return;
    }
    const current = ctx.store.getCard(card.id) ?? card;
    const available = ctx.store.getBalance(card.userId).available;
    decision = decideSpend({
      cardStatus: current.status,
      amountCents: input.amountCents,
      availableCents: available,
      merchantCountry: input.merchantCountry,
      blockedCountries: ctx.config.blockedCountries,
    });
    ctx.store.insertAuthorization({
      id: input.authId,
      userId: card.userId,
      cardId: card.id,
      amountCents: input.amountCents,
      merchantName: input.merchantName,
      merchantCountry: input.merchantCountry.toUpperCase(),
      approved: decision.approved,
      reason: decision.reason,
      createdAt: ctx.now(),
    });
    if (decision.approved) {
      ctx.store.insertLedger({
        id: id('led_'),
        userId: card.userId,
        cardId: card.id,
        direction: 'debit',
        amountCents: input.amountCents,
        kind: 'purchase',
        ref: `auth:${input.authId}`,
        memo: input.merchantName,
        createdAt: ctx.now(),
      });
    }
  });
  } catch (error) {
    const storedAfterRace = ctx.store.getAuthorization(input.authId);
    if (storedAfterRace) return { approved: storedAfterRace.approved, reason: storedAfterRace.reason };
    throw error;
  }
  const updated = ctx.store.getCard(card.id);
  if (updated) refreshLocalStatus(ctx, updated);
  const stored = ctx.store.getAuthorization(input.authId);
  return stored ? { approved: stored.approved, reason: stored.reason } : decision;
}

export function simulatePurchase(
  ctx: Ctx,
  userId: string,
  input: { amount?: string; merchantName?: string; merchantCountry?: string },
) {
  if (!ctx.config.simulatePurchases) {
    throw new HttpError(403, 'simulation_disabled', 'Live mode takes purchases from the card network.');
  }
  const card = requireCard(ctx, userId);
  const country = (input.merchantCountry ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) {
    throw new HttpError(400, 'invalid_country', 'Enter the merchant country as two letters, such as JP.');
  }
  const dollars = input.amount ?? '';
  if (!/^\d+(\.\d{1,2})?$/.test(dollars)) {
    throw new HttpError(400, 'invalid_amount', 'Enter the charge in dollars, such as 12.50.');
  }
  const amountCents = Math.round(Number(dollars) * 100);
  const merchantName = (input.merchantName ?? 'Card payment').trim().slice(0, 80) || 'Card payment';
  const decision = applySpend(ctx, card, {
    authId: id('iauth_sim_'),
    amountCents,
    merchantName,
    merchantCountry: country,
  });
  return {
    ...decision,
    message: spendMessage(decision.reason),
    balance: ctx.store.getBalance(userId),
    card: publicCard(ctx.store.getCardByUser(userId) ?? card),
  };
}

type StripeAuth = {
  id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  card?: string | { id?: string };
  merchant_data?: { name?: string; country?: string };
  pending_request?: { amount?: number; currency?: string };
};

function issuerCardIdOf(card: StripeAuth['card']): string {
  if (!card) return '';
  return typeof card === 'string' ? card : card.id ?? '';
}

export function handleStripeEvent(ctx: Ctx, event: { type?: string; data?: { object?: StripeAuth } }) {
  const object = event.data?.object;
  if (!object?.id) return { received: true };
  const card = ctx.store.getCardByIssuerId(issuerCardIdOf(object.card));
  if (event.type === 'issuing_authorization.request' || event.type === 'issuing_authorization.created') {
    if (!card) return { approved: false };
    const amount = object.pending_request?.amount ?? object.amount ?? 0;
    const currency = (object.pending_request?.currency ?? object.currency ?? 'usd').toLowerCase();
    if (currency !== card.currency) {
      return { approved: false, reason: 'currency_mismatch' };
    }
    if (event.type === 'issuing_authorization.created' && ctx.store.getAuthorization(object.id)) {
      return { received: true };
    }
    const decision = applySpend(ctx, card, {
      authId: object.id,
      amountCents: amount,
      merchantName: object.merchant_data?.name || 'Card payment',
      merchantCountry: object.merchant_data?.country || '',
    });
    if (event.type === 'issuing_authorization.request') return { approved: decision.approved };
    return { received: true };
  }
  if (event.type === 'issuing_authorization.updated' && object.status === 'reversed' && card) {
    const ref = `reversal:${object.id}`;
    if (ctx.store.findLedgerByRef(`auth:${object.id}`) && !ctx.store.findLedgerByRef(ref)) {
      const amount = object.amount ?? 0;
      if (amount > 0) {
        ctx.store.insertLedger({
          id: id('led_'),
          userId: card.userId,
          cardId: card.id,
          direction: 'credit',
          amountCents: amount,
          kind: 'reversal',
          ref,
          memo: 'authorization reversed',
          createdAt: ctx.now(),
        });
        refreshLocalStatus(ctx, card);
      }
    }
  }
  return { received: true };
}

function cardholderName(ctx: Ctx, userId: string): string {
  const holder = ctx.store.getCardholder(userId);
  if (!holder) return '';
  return `${holder.firstName} ${holder.lastName}`.trim();
}

export function describeWallet(
  ctx: Ctx,
  userId: string,
  wallet: 'apple_pay' | 'google_pay' | 'samsung_pay',
) {
  const card = requireCard(ctx, userId);
  const holder = ctx.store.getCardholder(userId);
  const pushReady = card.issuerMode === 'stripe';
  ctx.store.addWalletEvent({
    id: id('wal_'),
    userId,
    cardId: card.id,
    wallet,
    status: 'prepare',
    detail: pushReady ? 'stripe' : 'simulator',
    createdAt: ctx.now(),
  });
  return {
    wallet,
    cardId: card.id,
    cardholderName: cardholderName(ctx, userId),
    primaryAccountSuffix: card.last4,
    paymentNetwork: card.brand,
    encryptionScheme: 'ECC_V2',
    manual: {
      available: Boolean(holder?.phone && holder.email),
      steps: MANUAL_STEPS,
    },
    push: {
      available: pushReady,
      endpoint: '/api/wallets/ephemeral-key',
      note: pushReady
        ? 'The phone app asks this server for a Stripe ephemeral key while the wallet builds the encrypted payload.'
        : 'Connect STRIPE_SECRET_KEY and issue the card through Stripe Issuing. The wallet tokenizes that card.',
    },
  };
}

export async function ephemeralKey(
  ctx: Ctx,
  userId: string,
  input: { cardId?: string; apiVersion?: string; nonce?: string },
) {
  const card = requireCard(ctx, userId);
  if (input.cardId && input.cardId !== card.id) {
    throw new HttpError(403, 'wrong_card', 'That card belongs to another account.');
  }
  if (card.issuerMode !== 'stripe') {
    throw new HttpError(
      409,
      'issuer_not_live',
      'Apple Pay and Google Pay tokenize a Stripe Issuing card. Connect STRIPE_SECRET_KEY and issue the card again.',
    );
  }
  const apiVersion = (input.apiVersion ?? '').trim() || ctx.config.stripeApiVersion;
  const key = await ctx.issuer.createEphemeralKey({
    cardId: card.issuerCardId,
    apiVersion,
    nonce: input.nonce?.trim() || undefined,
  });
  ctx.store.addWalletEvent({
    id: id('wal_'),
    userId,
    cardId: card.id,
    wallet: 'ephemeral_key',
    status: 'issued',
    detail: 'scoped to this card',
    createdAt: ctx.now(),
  });
  return key;
}

export async function samsungProvision(
  ctx: Ctx,
  userId: string,
  input: { deviceId?: string; walletUserId?: string },
) {
  const card = requireCard(ctx, userId);
  const base = describeWallet(ctx, userId, 'samsung_pay');
  const missing: string[] = [];
  if (card.issuerMode !== 'stripe') missing.push('A Stripe Issuing card');
  if (!card.vCardId) missing.push('A Visa vCardID on the card (operator endpoint)');
  if (!ctx.config.visaApiKey || !ctx.config.visaSharedSecret) missing.push('VISA_API_KEY and VISA_SHARED_SECRET');
  const deviceId = (input.deviceId ?? '').trim();
  const walletUserId = (input.walletUserId ?? '').trim();
  if (!deviceId) missing.push('Samsung deviceID from SamsungPay.getWalletInfo');
  if (!walletUserId) missing.push('Samsung WALLET_USER_ID from SamsungPay.getWalletInfo');
  const response: Record<string, unknown> = {
    ...base,
    missing,
    addCardInfo: {
      cardType: 'DEBIT',
      tokenizationProvider: 'VISA',
      issuerId: ctx.config.cardBin || undefined,
    },
  };
  if (missing.length > 0) return response;
  const payload = await requestSamsungCardData({
    apiKey: ctx.config.visaApiKey,
    sharedSecret: ctx.config.visaSharedSecret,
    apiBase: ctx.config.visaApiBase,
    certPath: ctx.config.visaCertPath,
    keyPath: ctx.config.visaKeyPath,
    vCardId: card.vCardId,
    deviceId,
    clientCustomerId: walletUserId,
    now: ctx.now,
  });
  ctx.store.addWalletEvent({
    id: id('wal_'),
    userId,
    cardId: card.id,
    wallet: 'samsung_pay',
    status: 'push_payload',
    detail: 'opaquePaymentCard issued',
    createdAt: ctx.now(),
  });
  return {
    ...response,
    missing: [],
    opaquePaymentCard: payload.opaquePaymentCard,
    addCardInfo: {
      cardType: 'DEBIT',
      tokenizationProvider: 'VISA',
      extraProvisionPayload: payload.opaquePaymentCard,
      issuerId: ctx.config.cardBin || undefined,
    },
  };
}

export function recordWalletEvent(ctx: Ctx, userId: string, input: { wallet?: string; status?: string }) {
  const card = requireCard(ctx, userId);
  const wallet = input.wallet ?? '';
  const status = input.status ?? '';
  if (!['apple_pay', 'google_pay', 'samsung_pay'].includes(wallet)) {
    throw new HttpError(400, 'invalid_wallet', 'Choose Apple Pay, Google Pay, or Samsung Pay.');
  }
  if (!['added', 'manual_started', 'push_requested'].includes(status)) {
    throw new HttpError(400, 'invalid_status', 'Unknown wallet status.');
  }
  ctx.store.addWalletEvent({
    id: id('wal_'),
    userId,
    cardId: card.id,
    wallet,
    status,
    detail: status,
    createdAt: ctx.now(),
  });
  return { ok: true };
}

export function activity(ctx: Ctx, userId: string) {
  const deposits = ctx.store.listDeposits(userId).map((row) => ({
    id: row.id,
    at: row.createdAt,
    title: row.depositSource === 'simulated' ? `Simulated ${row.symbol} top-up` : `${row.symbol} deposit`,
    detail: row.depositSource === 'simulated' ? 'Credited in the simulator' : row.txHash,
    amountCents: row.creditedCents,
  }));
  const auths = ctx.store.listAuthorizations(userId).map((row) => ({
    id: row.id,
    at: row.createdAt,
    title: row.approved ? row.merchantName : `${row.merchantName} declined`,
    detail: row.merchantCountry ? `${row.merchantCountry} · ${spendMessage(row.reason)}` : spendMessage(row.reason),
    amountCents: row.approved ? -row.amountCents : 0,
  }));
  const wallets = ctx.store.listWalletEvents(userId).map((row) => ({
    id: row.id,
    at: row.createdAt,
    title: row.wallet.replaceAll('_', ' '),
    detail: row.status,
    amountCents: 0,
  }));
  return {
    activity: [...deposits, ...auths, ...wallets].sort((a, b) => b.at - a.at).slice(0, 40),
  };
}

export function obligations(ctx: Ctx) {
  const totals = ctx.store.totals();
  return {
    creditedCents: totals.credits,
    availableCents: totals.available,
    treasuryAddress: ctx.config.treasuryAddress,
    note: 'Keep the Stripe Issuing balance funded for the credited USD. Token deposits sit on the treasury address.',
  };
}

export function attachVCard(ctx: Ctx, cardId: string, vCardId: string): void {
  const trimmed = vCardId.trim();
  if (!/^[\w-]{4,80}$/.test(trimmed)) {
    throw new HttpError(400, 'invalid_vcard', 'Enter the Visa vCardID for this card.');
  }
  const card = ctx.store.getCard(cardId);
  if (!card) throw new HttpError(404, 'card_not_found', 'Card not found.');
  ctx.store.setVCard(cardId, trimmed);
}

export function tokensEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}
