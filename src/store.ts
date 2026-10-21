import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';

export type UserRow = { id: string; email: string; passwordHash: string; createdAt: number };
export type CardholderRow = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dobDay: number;
  dobMonth: number;
  dobYear: number;
  line1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  termsAcceptedAt: number;
  termsIp: string;
  issuerCardholderId: string;
  issuerMode: string;
  createdAt: number;
};
export type CardRow = {
  id: string;
  userId: string;
  issuerCardId: string;
  issuerMode: string;
  type: string;
  currency: string;
  status: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  vCardId: string;
  spendingLimitCents: number;
  syncError: string;
  createdAt: number;
};
export type CustomTokenRow = {
  id: string;
  userId: string;
  chainId: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  createdAt: number;
};
export type DepositRow = {
  id: string;
  userId: string;
  tokenKey: string;
  chainId: number;
  tokenAddress: string;
  symbol: string;
  txHash: string;
  logIndex: number;
  amountRaw: string;
  priceUsd: string;
  creditedCents: number;
  depositSource: string;
  createdAt: number;
};
export type AuthRow = {
  id: string;
  userId: string;
  cardId: string;
  amountCents: number;
  merchantName: string;
  merchantCountry: string;
  approved: boolean;
  reason: string;
  createdAt: number;
};

function num(row: Record<string, SQLOutputValue>, key: string): number {
  const value = row[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return Number(value);
  return 0;
}

function str(row: Record<string, SQLOutputValue>, key: string): string {
  const value = row[key];
  if (value == null) return '';
  return String(value);
}

export class Store {
  db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  close(): void {
    this.db.close();
  }

  transaction(fn: () => void): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      fn();
      this.db.exec('COMMIT');
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // The original error is the one to surface.
      }
      throw error;
    }
  }

  createUser(input: { id: string; email: string; passwordHash: string; createdAt: number }): void {
    this.db
      .prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(input.id, input.email, input.passwordHash, input.createdAt);
  }

  getUserByEmail(email: string): UserRow | undefined {
    const row = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    return row ? this.user(row) : undefined;
  }

  getUser(id: string): UserRow | undefined {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return row ? this.user(row) : undefined;
  }

  createSession(token: string, userId: string, createdAt: number): void {
    this.db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, userId, createdAt);
  }

  getSession(token: string): { token: string; userId: string } | undefined {
    const row = this.db.prepare('SELECT token, user_id FROM sessions WHERE token = ?').get(token);
    if (!row) return undefined;
    return { token: str(row, 'token'), userId: str(row, 'user_id') };
  }

  deleteSession(token: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }

  getSettings(): Record<string, string> {
    const rows = this.db.prepare('SELECT key, value FROM settings').all();
    const out: Record<string, string> = {};
    for (const row of rows) out[str(row, 'key')] = str(row, 'value');
    return out;
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value);
  }

  saveCardholder(row: CardholderRow): void {
    this.db
      .prepare(
        `INSERT INTO cardholders (
          user_id, first_name, last_name, email, phone, dob_day, dob_month, dob_year,
          line1, city, state, postal_code, country, terms_accepted_at, terms_ip,
          issuer_cardholder_id, issuer_mode, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          first_name = excluded.first_name,
          last_name = excluded.last_name,
          email = excluded.email,
          phone = excluded.phone,
          dob_day = excluded.dob_day,
          dob_month = excluded.dob_month,
          dob_year = excluded.dob_year,
          line1 = excluded.line1,
          city = excluded.city,
          state = excluded.state,
          postal_code = excluded.postal_code,
          country = excluded.country,
          terms_accepted_at = excluded.terms_accepted_at,
          terms_ip = excluded.terms_ip,
          issuer_cardholder_id = excluded.issuer_cardholder_id,
          issuer_mode = excluded.issuer_mode`,
      )
      .run(
        row.userId,
        row.firstName,
        row.lastName,
        row.email,
        row.phone,
        row.dobDay,
        row.dobMonth,
        row.dobYear,
        row.line1,
        row.city,
        row.state,
        row.postalCode,
        row.country,
        row.termsAcceptedAt,
        row.termsIp,
        row.issuerCardholderId,
        row.issuerMode,
        row.createdAt,
      );
  }

  getCardholder(userId: string): CardholderRow | undefined {
    const row = this.db.prepare('SELECT * FROM cardholders WHERE user_id = ?').get(userId);
    if (!row) return undefined;
    return {
      userId: str(row, 'user_id'),
      firstName: str(row, 'first_name'),
      lastName: str(row, 'last_name'),
      email: str(row, 'email'),
      phone: str(row, 'phone'),
      dobDay: num(row, 'dob_day'),
      dobMonth: num(row, 'dob_month'),
      dobYear: num(row, 'dob_year'),
      line1: str(row, 'line1'),
      city: str(row, 'city'),
      state: str(row, 'state'),
      postalCode: str(row, 'postal_code'),
      country: str(row, 'country'),
      termsAcceptedAt: num(row, 'terms_accepted_at'),
      termsIp: str(row, 'terms_ip'),
      issuerCardholderId: str(row, 'issuer_cardholder_id'),
      issuerMode: str(row, 'issuer_mode'),
      createdAt: num(row, 'created_at'),
    };
  }

  insertCard(row: CardRow): void {
    this.db
      .prepare(
        `INSERT INTO cards (
          id, user_id, issuer_card_id, issuer_mode, type, currency, status, brand, last4,
          exp_month, exp_year, v_card_id, spending_limit_cents, sync_error, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.userId,
        row.issuerCardId,
        row.issuerMode,
        row.type,
        row.currency,
        row.status,
        row.brand,
        row.last4,
        row.expMonth,
        row.expYear,
        row.vCardId,
        row.spendingLimitCents,
        row.syncError,
        row.createdAt,
      );
  }

  getCardByUser(userId: string): CardRow | undefined {
    const row = this.db.prepare('SELECT * FROM cards WHERE user_id = ?').get(userId);
    return row ? this.card(row) : undefined;
  }

  getCardByIssuerId(issuerCardId: string): CardRow | undefined {
    const row = this.db.prepare('SELECT * FROM cards WHERE issuer_card_id = ?').get(issuerCardId);
    return row ? this.card(row) : undefined;
  }

  getCard(id: string): CardRow | undefined {
    const row = this.db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
    return row ? this.card(row) : undefined;
  }

  updateCardRuntime(id: string, status: string, spendingLimitCents: number, syncError: string): void {
    this.db
      .prepare('UPDATE cards SET status = ?, spending_limit_cents = ?, sync_error = ? WHERE id = ?')
      .run(status, spendingLimitCents, syncError, id);
  }

  setVCard(id: string, vCardId: string): void {
    this.db.prepare('UPDATE cards SET v_card_id = ? WHERE id = ?').run(vCardId, id);
  }

  insertCustomToken(row: CustomTokenRow): void {
    this.db
      .prepare(
        `INSERT INTO custom_tokens (id, user_id, chain_id, address, symbol, name, decimals, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(row.id, row.userId, row.chainId, row.address, row.symbol, row.name, row.decimals, row.createdAt);
  }

  listCustomTokens(userId: string): CustomTokenRow[] {
    return this.db
      .prepare('SELECT * FROM custom_tokens WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId)
      .map((row) => this.customToken(row));
  }

  getCustomToken(userId: string, id: string): CustomTokenRow | undefined {
    const row = this.db.prepare('SELECT * FROM custom_tokens WHERE user_id = ? AND id = ?').get(userId, id);
    return row ? this.customToken(row) : undefined;
  }

  getWallet(userId: string): { address: string } | undefined {
    const row = this.db.prepare('SELECT address FROM wallets WHERE user_id = ?').get(userId);
    return row ? { address: str(row, 'address') } : undefined;
  }

  walletOwner(address: string): string | undefined {
    const row = this.db.prepare('SELECT user_id FROM wallets WHERE address = ?').get(address);
    return row ? str(row, 'user_id') : undefined;
  }

  saveWallet(userId: string, address: string, linkedAt: number): void {
    this.db
      .prepare(
        `INSERT INTO wallets (user_id, address, linked_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET address = excluded.address, linked_at = excluded.linked_at`,
      )
      .run(userId, address, linkedAt);
  }

  setNonce(userId: string, nonce: string): void {
    this.db
      .prepare(
        `INSERT INTO wallet_nonces (user_id, nonce) VALUES (?, ?)
         ON CONFLICT(user_id) DO UPDATE SET nonce = excluded.nonce`,
      )
      .run(userId, nonce);
  }

  getNonce(userId: string): string {
    const row = this.db.prepare('SELECT nonce FROM wallet_nonces WHERE user_id = ?').get(userId);
    return row ? str(row, 'nonce') : '';
  }

  findDeposit(txHash: string, logIndex: number): DepositRow | undefined {
    const row = this.db.prepare('SELECT * FROM deposits WHERE tx_hash = ? AND log_index = ?').get(txHash, logIndex);
    return row ? this.deposit(row) : undefined;
  }

  insertDeposit(row: DepositRow): void {
    this.db
      .prepare(
        `INSERT INTO deposits (
          id, user_id, token_key, chain_id, token_address, symbol, tx_hash, log_index,
          amount_raw, price_usd, credited_cents, deposit_source, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.userId,
        row.tokenKey,
        row.chainId,
        row.tokenAddress,
        row.symbol,
        row.txHash,
        row.logIndex,
        row.amountRaw,
        row.priceUsd,
        row.creditedCents,
        row.depositSource,
        row.createdAt,
      );
  }

  listDeposits(userId: string): DepositRow[] {
    return this.db
      .prepare('SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 40')
      .all(userId)
      .map((row) => this.deposit(row));
  }

  insertLedger(input: {
    id: string;
    userId: string;
    cardId: string;
    direction: 'credit' | 'debit';
    amountCents: number;
    kind: string;
    ref: string;
    memo: string;
    createdAt: number;
  }): void {
    this.db
      .prepare(
        `INSERT INTO ledger (id, user_id, card_id, direction, amount_cents, kind, ref, memo, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.userId,
        input.cardId,
        input.direction,
        input.amountCents,
        input.kind,
        input.ref,
        input.memo,
        input.createdAt,
      );
  }

  findLedgerByRef(ref: string): boolean {
    return Boolean(this.db.prepare('SELECT id FROM ledger WHERE ref = ?').get(ref));
  }

  getBalance(userId: string): { credits: number; debits: number; available: number } {
    const row = this.db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_cents ELSE 0 END), 0) AS credits,
          COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_cents ELSE 0 END), 0) AS debits
         FROM ledger WHERE user_id = ?`,
      )
      .get(userId);
    const credits = row ? num(row, 'credits') : 0;
    const debits = row ? num(row, 'debits') : 0;
    return { credits, debits, available: credits - debits };
  }

  insertAuthorization(row: AuthRow): void {
    this.db
      .prepare(
        `INSERT INTO authorizations (
          id, user_id, card_id, amount_cents, merchant_name, merchant_country, approved, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.userId,
        row.cardId,
        row.amountCents,
        row.merchantName,
        row.merchantCountry,
        row.approved ? 1 : 0,
        row.reason,
        row.createdAt,
      );
  }

  getAuthorization(id: string): AuthRow | undefined {
    const row = this.db.prepare('SELECT * FROM authorizations WHERE id = ?').get(id);
    return row ? this.authorization(row) : undefined;
  }

  listAuthorizations(userId: string): AuthRow[] {
    return this.db
      .prepare('SELECT * FROM authorizations WHERE user_id = ? ORDER BY created_at DESC LIMIT 40')
      .all(userId)
      .map((row) => this.authorization(row));
  }

  addWalletEvent(input: {
    id: string;
    userId: string;
    cardId: string;
    wallet: string;
    status: string;
    detail: string;
    createdAt: number;
  }): void {
    this.db
      .prepare(
        `INSERT INTO wallet_events (id, user_id, card_id, wallet, status, detail, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(input.id, input.userId, input.cardId, input.wallet, input.status, input.detail, input.createdAt);
  }

  listWalletEvents(userId: string): Array<{ id: string; wallet: string; status: string; detail: string; createdAt: number }> {
    return this.db
      .prepare('SELECT * FROM wallet_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 40')
      .all(userId)
      .map((row) => ({
        id: str(row, 'id'),
        wallet: str(row, 'wallet'),
        status: str(row, 'status'),
        detail: str(row, 'detail'),
        createdAt: num(row, 'created_at'),
      }));
  }

  totals(): { credits: number; available: number } {
    const row = this.db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_cents ELSE 0 END), 0) AS credits,
          COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_cents ELSE -amount_cents END), 0) AS available
         FROM ledger`,
      )
      .get();
    return { credits: row ? num(row, 'credits') : 0, available: row ? num(row, 'available') : 0 };
  }

  private user(row: Record<string, SQLOutputValue>): UserRow {
    return {
      id: str(row, 'id'),
      email: str(row, 'email'),
      passwordHash: str(row, 'password_hash'),
      createdAt: num(row, 'created_at'),
    };
  }

  private card(row: Record<string, SQLOutputValue>): CardRow {
    return {
      id: str(row, 'id'),
      userId: str(row, 'user_id'),
      issuerCardId: str(row, 'issuer_card_id'),
      issuerMode: str(row, 'issuer_mode'),
      type: str(row, 'type'),
      currency: str(row, 'currency'),
      status: str(row, 'status'),
      brand: str(row, 'brand'),
      last4: str(row, 'last4'),
      expMonth: num(row, 'exp_month'),
      expYear: num(row, 'exp_year'),
      vCardId: str(row, 'v_card_id'),
      spendingLimitCents: num(row, 'spending_limit_cents'),
      syncError: str(row, 'sync_error'),
      createdAt: num(row, 'created_at'),
    };
  }

  private customToken(row: Record<string, SQLOutputValue>): CustomTokenRow {
    return {
      id: str(row, 'id'),
      userId: str(row, 'user_id'),
      chainId: num(row, 'chain_id'),
      address: str(row, 'address'),
      symbol: str(row, 'symbol'),
      name: str(row, 'name'),
      decimals: num(row, 'decimals'),
      createdAt: num(row, 'created_at'),
    };
  }

  private deposit(row: Record<string, SQLOutputValue>): DepositRow {
    return {
      id: str(row, 'id'),
      userId: str(row, 'user_id'),
      tokenKey: str(row, 'token_key'),
      chainId: num(row, 'chain_id'),
      tokenAddress: str(row, 'token_address'),
      symbol: str(row, 'symbol'),
      txHash: str(row, 'tx_hash'),
      logIndex: num(row, 'log_index'),
      amountRaw: str(row, 'amount_raw'),
      priceUsd: str(row, 'price_usd'),
      creditedCents: num(row, 'credited_cents'),
      depositSource: str(row, 'deposit_source'),
      createdAt: num(row, 'created_at'),
    };
  }

  private authorization(row: Record<string, SQLOutputValue>): AuthRow {
    return {
      id: str(row, 'id'),
      userId: str(row, 'user_id'),
      cardId: str(row, 'card_id'),
      amountCents: num(row, 'amount_cents'),
      merchantName: str(row, 'merchant_name'),
      merchantCountry: str(row, 'merchant_country'),
      approved: num(row, 'approved') === 1,
      reason: str(row, 'reason'),
      createdAt: num(row, 'created_at'),
    };
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cardholders (
  user_id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  dob_day INTEGER NOT NULL,
  dob_month INTEGER NOT NULL,
  dob_year INTEGER NOT NULL,
  line1 TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  country TEXT NOT NULL,
  terms_accepted_at INTEGER NOT NULL,
  terms_ip TEXT NOT NULL,
  issuer_cardholder_id TEXT NOT NULL,
  issuer_mode TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  issuer_card_id TEXT NOT NULL UNIQUE,
  issuer_mode TEXT NOT NULL,
  type TEXT NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  brand TEXT NOT NULL,
  last4 TEXT NOT NULL,
  exp_month INTEGER NOT NULL,
  exp_year INTEGER NOT NULL,
  v_card_id TEXT NOT NULL DEFAULT '',
  spending_limit_cents INTEGER NOT NULL DEFAULT 0,
  sync_error TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS custom_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  address TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  decimals INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, chain_id, address)
);
CREATE TABLE IF NOT EXISTS wallets (
  user_id TEXT PRIMARY KEY,
  address TEXT NOT NULL UNIQUE,
  linked_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS wallet_nonces (
  user_id TEXT PRIMARY KEY,
  nonce TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS deposits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_key TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  token_address TEXT NOT NULL,
  symbol TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  amount_raw TEXT NOT NULL,
  price_usd TEXT NOT NULL,
  credited_cents INTEGER NOT NULL,
  deposit_source TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (tx_hash, log_index)
);
CREATE TABLE IF NOT EXISTS ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL UNIQUE,
  memo TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS authorizations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  merchant_name TEXT NOT NULL,
  merchant_country TEXT NOT NULL,
  approved INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wallet_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  wallet TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id);
CREATE INDEX IF NOT EXISTS deposits_user ON deposits(user_id);
`;

export function openStore(dbPath: string): Store {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);
  return new Store(db);
}
