import { timingSafeEqual } from 'node:crypto';
import { decodeTransfers, isAddress, receiptSucceeded } from './abi.ts';
import { CATALOG, chainById, findCatalog, findCatalogById, type CatalogToken } from './chains.ts';
import type { Config } from './config.ts';
import { readErc20, type RpcClient } from './erc20.ts';
import { HttpError } from './errors.ts';
import {
  contractAddressFrom,
  createImmersveIssuer,
  isLiveImmersveKey,
  isTestImmersveKey,
  kycUrlFrom,
  LIVE_KEY_MESSAGE,
  type ImmersveIssuer,
} from './issuer.ts';
import { id, secretToken } from './ids.ts';
import {
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
import { ADMIN_EMAIL } from './admin.ts';
import type { PriceClient } from './prices.ts';
import { linkMessage, signatureMatches } from './signature.ts';
import type { CardRow, ImmersveSession, Store } from './store.ts';
import { requestSamsungCardData } from './visa.ts';

export type Ctx = {
  config: Config;
  store: Store;
  rpc: RpcClient;
  prices: PriceClient;
  issuer: ImmersveIssuer;
  fetchImpl: typeof fetch;
  now: () => number;
};

type KnownToken = CatalogToken & { source: 'catalog' | 'custom' };

const MANUAL_STEPS = [
  'On iPhone, add the card from the OfflineRich app. Apple Pay uses the PassKit payload from this server.',
  'For Google Pay or Samsung Pay, open the one-time secure card link and type the number into the wallet.',
  'Enter the code the wallet sends to the cardholder phone or email.',
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
  if (card.issuerMode !== 'immersve' || !ctx.config.livemode) {
    return { ok: false, message: 'Connect live Immersve so this card can be refreshed.' };
  }
  try {
    const access = await refreshAccess(ctx, userId);
    const remote = await ctx.issuer.getCard(access.token, card.issuerCardId);
    const status = remote.status === 'active' ? 'active' : card.status;
    ctx.store.updateCardRuntime(card.id, status, card.spendingLimitCents, '');
    await rememberBalance(ctx, userId, access.token);
    return { ok: true, message: 'Immersve card details refreshed.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Immersve card refresh failed.';
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
  if (email === ADMIN_EMAIL) {
    throw new HttpError(409, 'email_taken', 'That email belongs to the card desk. Sign in as admin.');
  }
  if (ctx.store.getUserByEmail(email)) {
    throw new HttpError(409, 'email_taken', 'An account with that email already exists. Sign in instead.');
  }
  const userId = id('usr_');
  const createdAt = ctx.now();
  ctx.store.createUser({ id: userId, email, passwordHash: await hashPassword(password), createdAt, role: 'customer' });
  const token = secretToken();
  ctx.store.createSession(token, userId, createdAt);
  return { token, user: { id: userId, email, username: '', role: 'customer' } };
}

export async function login(ctx: Ctx, input: { email?: string; username?: string; password?: string }) {
  const username = (input.username ?? '').trim().toLowerCase();
  const email = (input.email ?? '').trim().toLowerCase();
  const password = input.password ?? '';
  const handle = username || email;
  const user = handle.includes('@') ? ctx.store.getUserByEmail(handle) : ctx.store.getUserByUsername(handle);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new HttpError(401, 'invalid_login', 'Those sign-in details are incorrect.');
  }
  const token = secretToken();
  ctx.store.createSession(token, user.id, ctx.now());
  return { token, user: publicUser(user) };
}

function publicUser(user: { id: string; email: string; username: string; role: string }) {
  return { id: user.id, email: user.email, username: user.username, role: user.role || 'customer' };
}

export function requireAdmin(ctx: Ctx, userId: string) {
  const user = ctx.store.getUser(userId);
  if (!user || user.role !== 'admin') {
    throw new HttpError(403, 'admin_required', 'The card desk is limited to the admin account.');
  }
  return user;
}

export function adminDesk(ctx: Ctx, userId: string) {
  requireAdmin(ctx, userId);
  const totals = ctx.store.totals();
  return {
    accounts: ctx.store.listAccounts().map((account) => ({
      id: account.id,
      email: account.email,
      username: account.username,
      role: account.role,
      createdAt: account.createdAt,
      availableCents: account.availableCents,
      card: account.last4
        ? { brand: account.brand, last4: account.last4, status: account.cardStatus, type: account.cardType }
        : null,
    })),
    totals: { creditedCents: totals.credits, availableCents: totals.available, currency: 'usd' },
  };
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
  const session = ctx.store.getImmersveSession(userId);
  const availableCents = session && session.balanceCents >= 0 ? session.balanceCents : balance.available;
  return {
    user: publicUser(user),
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
      availableCents,
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
    treasuryAddress: depositTarget(ctx, userId),
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
    depositSource: 'chain',
    createdAt: ctx.now(),
  });
  ctx.store.insertLedger({
    id: id('led_'),
    userId: input.userId,
    cardId: card?.id ?? '',
    direction: 'credit',
    amountCents: input.netCents,
    kind: 'topup',
    ref: `deposit:${input.txHash}:${input.logIndex}`,
    memo: input.token.symbol,
    createdAt: ctx.now(),
  });
}

export async function confirmTopup(ctx: Ctx, userId: string, input: { tokenId?: string; txHash?: string }) {
  const depositAddress = depositTarget(ctx, userId);
  if (!depositAddress) {
    throw new HttpError(400, 'treasury_unset', 'Issue the card first. Immersve returns the deposit contract the token must be sent to.');
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
    (transfer) => transfer.to === depositAddress && transfer.from === wallet.address,
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
        });
      }
    });
  }
  const sync = await syncCard(ctx, userId);
  try {
    const access = await refreshAccess(ctx, userId);
    await rememberBalance(ctx, userId, access.token);
  } catch {
    // The on-chain credit is stored either way. The Immersve balance refreshes on the next card sync.
  }
  const creditedCents = fresh.reduce((sum, item) => sum + item.netCents, 0);
  return {
    creditedCents,
    alreadyCredited: fresh.length === 0,
    priceUsd: price,
    balance: ctx.store.getBalance(userId),
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

function liveKeyError(apiKey: string, apiSecret: string): HttpError {
  if (isTestImmersveKey(apiKey, apiSecret)) {
    return new HttpError(
      400,
      'live_key_required',
      'Immersve test keys only talk to the test network and cannot be added to Apple Pay or spent at a merchant. Connect the live key pair from your Immersve partner account.',
    );
  }
  return new HttpError(400, 'live_key_required', LIVE_KEY_MESSAGE);
}

export function requireLive(ctx: Ctx): void {
  if (ctx.config.livemode) return;
  throw liveKeyError(ctx.config.immersveApiKey, ctx.config.immersveApiSecret);
}

function blankSession(userId: string, now: number): ImmersveSession {
  return {
    userId,
    accountId: '',
    refreshToken: '',
    loginRequestId: '',
    fundingSourceId: '',
    depositAddress: '',
    balanceCents: -1,
    updatedAt: now,
  };
}

function depositTarget(ctx: Ctx, userId: string): string | null {
  const session = ctx.store.getImmersveSession(userId);
  if (session?.depositAddress && isAddress(session.depositAddress)) return session.depositAddress;
  return ctx.config.treasuryAddress;
}

function saveSession(ctx: Ctx, session: ImmersveSession): void {
  ctx.store.saveImmersveSession({ ...session, updatedAt: ctx.now() });
}

async function refreshAccess(ctx: Ctx, userId: string): Promise<{ token: string; session: ImmersveSession }> {
  const session = ctx.store.getImmersveSession(userId);
  if (!session?.refreshToken || !session.accountId) {
    throw new HttpError(409, 'wallet_login_required', 'Sign the Immersve login from the linked wallet before this step.');
  }
  const refreshed = await ctx.issuer.refresh(session.refreshToken);
  session.refreshToken = refreshed.refreshToken;
  saveSession(ctx, session);
  return { token: refreshed.accessToken, session };
}

async function rememberBalance(ctx: Ctx, userId: string, accessToken: string): Promise<void> {
  const session = ctx.store.getImmersveSession(userId);
  if (!session?.accountId || !session.fundingSourceId) return;
  const cents = await ctx.issuer.fundingBalanceCents(accessToken, session.accountId, session.fundingSourceId);
  if (cents == null) return;
  session.balanceCents = cents;
  saveSession(ctx, session);
}

function issuerFrom(ctx: Ctx) {
  return createImmersveIssuer({
    apiKey: ctx.config.immersveApiKey,
    apiSecret: ctx.config.immersveApiSecret,
    clientApplicationId: ctx.config.immersveClientApplicationId,
    partnerAccountId: ctx.config.immersvePartnerAccountId,
    cardProgramId: ctx.config.immersveCardProgramId,
    fundingChannelId: ctx.config.immersveFundingChannelId,
    clientOrigin: ctx.config.immersveClientOrigin,
    network: ctx.config.immersveNetwork,
    fetchImpl: ctx.fetchImpl,
  });
}

export async function connectLive(
  ctx: Ctx,
  input: {
    apiKey?: string;
    apiSecret?: string;
    clientApplicationId?: string;
    partnerAccountId?: string;
    cardProgramId?: string;
    fundingChannelId?: string;
    clientOrigin?: string;
    network?: string;
  },
) {
  if (ctx.config.keySource === 'env') {
    throw new HttpError(
      409,
      'already_connected',
      ctx.config.livemode
        ? 'Live Immersve keys are already set in the server environment.'
        : 'The server environment already sets IMMERSVE_API_KEY. Put the live key pair there.',
    );
  }
  if (ctx.config.livemode) {
    throw new HttpError(409, 'already_connected', 'Live Immersve keys are already connected. Clear the saved database settings to rotate them.');
  }
  const apiKey = (input.apiKey ?? '').trim();
  const apiSecret = (input.apiSecret ?? '').trim();
  const clientApplicationId = (input.clientApplicationId ?? '').trim();
  const partnerAccountId = (input.partnerAccountId ?? '').trim();
  const cardProgramId = (input.cardProgramId ?? '').trim();
  const fundingChannelId = (input.fundingChannelId ?? '').trim();
  const clientOrigin = (input.clientOrigin ?? '').trim().replace(/\/$/, '');
  const network = (input.network ?? '').trim() || 'ethereum-mainnet';
  if (!isLiveImmersveKey(apiKey, apiSecret)) throw liveKeyError(apiKey, apiSecret);
  for (const value of [clientApplicationId, partnerAccountId, cardProgramId, fundingChannelId]) {
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(value)) {
      throw new HttpError(400, 'invalid_program', 'Paste the Immersve partner account, client application, card program, and funding channel ids.');
    }
  }
  if (!/^https:\/\/[^\s]+$/.test(clientOrigin)) {
    throw new HttpError(400, 'invalid_origin', 'Enter the https origin Immersve allowed for this client application.');
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(network)) {
    throw new HttpError(400, 'invalid_network', 'Enter an Immersve network such as ethereum-mainnet.');
  }
  ctx.config.immersveApiKey = apiKey;
  ctx.config.immersveApiSecret = apiSecret;
  ctx.config.immersveClientApplicationId = clientApplicationId;
  ctx.config.immersvePartnerAccountId = partnerAccountId;
  ctx.config.immersveCardProgramId = cardProgramId;
  ctx.config.immersveFundingChannelId = fundingChannelId;
  ctx.config.immersveClientOrigin = clientOrigin;
  ctx.config.immersveNetwork = network;
  const issuer = issuerFrom(ctx);
  await issuer.probePartner();
  ctx.store.setSetting('immersve_api_key', apiKey);
  ctx.store.setSetting('immersve_api_secret', apiSecret);
  ctx.store.setSetting('immersve_client_application_id', clientApplicationId);
  ctx.store.setSetting('immersve_partner_account_id', partnerAccountId);
  ctx.store.setSetting('immersve_card_program_id', cardProgramId);
  ctx.store.setSetting('immersve_funding_channel_id', fundingChannelId);
  ctx.store.setSetting('immersve_client_origin', clientOrigin);
  ctx.store.setSetting('immersve_network', network);
  ctx.config.livemode = true;
  ctx.config.keySource = 'saved';
  ctx.issuer = issuer;
  return { livemode: true as const, network };
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
    walletSignature?: string;
  },
  termsIp: string,
) {
  requireLive(ctx);
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
  const wallet = ctx.store.getWallet(userId);
  if (!wallet) throw new HttpError(400, 'wallet_unlinked', 'Link the wallet that will fund the card.');
  let session = ctx.store.getImmersveSession(userId) ?? blankSession(userId, ctx.now());
  if (!session.refreshToken) {
    const signature = (input.walletSignature ?? '').trim();
    if (!signature) {
      const started = await ctx.issuer.loginInit({ address: wallet.address });
      session.loginRequestId = started.loginRequestId;
      saveSession(ctx, session);
      return { status: 'signature_required' as const, message: started.message };
    }
    if (!session.loginRequestId) {
      throw new HttpError(400, 'signature_required', 'Request the Immersve login message, sign it, and submit it again.');
    }
    const done = await ctx.issuer.loginComplete({ loginRequestId: session.loginRequestId, signature });
    session.accountId = done.cardholderAccountId;
    session.refreshToken = done.refreshToken;
    session.loginRequestId = '';
    saveSession(ctx, session);
  }
  const access = await refreshAccess(ctx, userId);
  session = access.session;
  await ctx.issuer.updateContact(access.token, session.accountId, email, phone);
  if (!session.fundingSourceId) {
    const funding = await ctx.issuer.createFundingSource(access.token, session.accountId, wallet.address);
    session.fundingSourceId = funding.id;
    saveSession(ctx, session);
  }
  const prerequisites = await ctx.issuer.spendingPrerequisites(access.token, session.fundingSourceId, 100);
  const contract = contractAddressFrom(prerequisites);
  if (contract) session.depositAddress = contract;
  saveSession(ctx, session);
  const kycUrl = kycUrlFrom(prerequisites);
  if (kycUrl) return { status: 'kyc_required' as const, kycUrl };
  const created = await ctx.issuer.createCard(access.token, session.fundingSourceId);
  const issued = await ctx.issuer.getCard(access.token, created.cardId);
  const termsAcceptedAt = ctx.now();
  const existing = ctx.store.getCardholder(userId);
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
    issuerCardholderId: session.accountId,
    issuerMode: 'immersve',
    createdAt: existing?.createdAt ?? termsAcceptedAt,
  });
  ctx.store.insertCard({
    id: id('card_'),
    userId,
    issuerCardId: issued.id,
    issuerMode: 'immersve',
    type,
    currency: 'usd',
    status: issued.status === 'active' ? 'active' : 'inactive',
    brand: issued.brand,
    last4: issued.last4,
    expMonth: issued.expMonth,
    expYear: issued.expYear,
    vCardId: issued.seriesId,
    spendingLimitCents: 1,
    syncError: '',
    createdAt: ctx.now(),
  });
  await rememberBalance(ctx, userId, access.token);
  const card = ctx.store.getCardByUser(userId);
  return { status: 'issued' as const, card: card ? publicCard(card) : null, depositAddress: session.depositAddress };
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
  const pushReady = card.issuerMode === 'immersve' && ctx.config.livemode;
  ctx.store.addWalletEvent({
    id: id('wal_'),
    userId,
    cardId: card.id,
    wallet,
    status: 'prepare',
    detail: pushReady ? 'immersve' : 'live_key_required',
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
        ? wallet === 'apple_pay'
          ? 'The iPhone app sends the PassKit certificate chain to POST /api/wallets/apple. Immersve returns the Apple Pay payload.'
          : 'Open the one-time secure card link and type the card into the wallet.'
        : 'Issue this card with live Immersve. Apple Pay, Google Pay, and Samsung Pay add that card.',
    },
  };
}

export async function secureCardLink(ctx: Ctx, userId: string) {
  const card = requireCard(ctx, userId);
  if (card.issuerMode !== 'immersve' || !ctx.config.livemode) {
    throw new HttpError(409, 'issuer_not_live', LIVE_KEY_MESSAGE);
  }
  const access = await refreshAccess(ctx, userId);
  return ctx.issuer.panToken(access.token, card.issuerCardId);
}

export async function ephemeralKey(
  ctx: Ctx,
  userId: string,
  input: { cardId?: string; nonce?: string; nonceSignature?: string; certChain?: string[] },
) {
  const card = requireCard(ctx, userId);
  if (input.cardId && input.cardId !== card.id) {
    throw new HttpError(403, 'wrong_card', 'That card belongs to another account.');
  }
  if (card.issuerMode !== 'immersve' || !ctx.config.livemode) {
    throw new HttpError(409, 'issuer_not_live', LIVE_KEY_MESSAGE);
  }
  const certChain = Array.isArray(input.certChain) ? input.certChain.map((item) => String(item)) : [];
  const nonce = (input.nonce ?? '').trim();
  const nonceSignature = (input.nonceSignature ?? '').trim();
  if (certChain.length === 0 || !nonce || !nonceSignature) {
    throw new HttpError(400, 'apple_payload_required', 'Send the PassKit certificate chain, nonce, and nonce signature.');
  }
  const access = await refreshAccess(ctx, userId);
  const key = await ctx.issuer.provisionApplePay(access.token, card.issuerCardId, { certChain, nonce, nonceSignature });
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
  if (card.issuerMode !== 'immersve' || !ctx.config.livemode) missing.push('A card issued by live Immersve');
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
    title: `${row.symbol} deposit`,
    detail: row.txHash,
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
    note: 'Token deposits fund the Immersve card contract. The spendable balance is the amount Immersve reports for that contract.',
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
