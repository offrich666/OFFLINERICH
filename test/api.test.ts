import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { privateKeyToAccount } from 'viem/accounts';
import { ADMIN_PASSWORD, ADMIN_USERNAME } from '../src/admin.ts';
import { createApp, type CreateAppOptions } from '../src/app.ts';
import type { RpcClient } from '../src/erc20.ts';

const treasury = '0x1111111111111111111111111111111111111111';
const dead = '0x000000000000000000000000000000000000dead';
const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');

function encodeAbiString(value: string): string {
  const data = Buffer.from(value, 'utf8').toString('hex').padEnd(64, '0');
  return `0x${'20'.padStart(64, '0')}${value.length.toString(16).padStart(64, '0')}${data}`;
}

function listen(options: CreateAppOptions) {
  const app = createApp({ ...options, env: { SELF_SIGNUP: '1', ...(options.env ?? {}) } });
  return new Promise<{ base: string; close: () => Promise<void> }>((resolve) => {
    const server: Server = app.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      resolve({
        base: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise((done) => {
            server.close(() => {
              const closeStore = app.locals.closeStore as (() => void) | undefined;
              closeStore?.();
              done();
            });
          }),
      });
    });
  });
}

async function call(base: string, path: string, token?: string, body?: unknown, extraHeaders?: Record<string, string>) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const data = (await response.json()) as Record<string, unknown>;
  return { status: response.status, data };
}

function chainRpc(receipt: { current: unknown }): RpcClient {
  return {
    async call(_chainId, method, params) {
      if (method === 'eth_getTransactionReceipt') return receipt.current;
      if (method === 'eth_call') {
        const request = params[0] as { to?: string; data?: string };
        if (request.to !== dead) return '0x';
        if (request.data === '0x95d89b41') return encodeAbiString('TEST');
        if (request.data === '0x06fdde03') return encodeAbiString('Test Token');
        if (request.data === '0x313ce567') return `0x${(18).toString(16).padStart(64, '0')}`;
      }
      throw new Error(`unexpected ${method}`);
    },
  };
}

const prices = {
  async getMany(ids: string[]) {
    const out: Record<string, { price: number; confidence: number } | null> = {};
    for (const id of ids) out[id] = id.endsWith('dead') ? { price: 2.5, confidence: 0.99 } : null;
    return out;
  },
};


const liveKey = 'imm-key-livefixture';
const liveSecret = 'imm-secret-livefixture';
const partnerAccountId = 'partneracc1';

const liveEnv = {
  IMMERSVE_API_KEY: liveKey,
  IMMERSVE_API_SECRET: liveSecret,
  IMMERSVE_PARTNER_ACCOUNT_ID: partnerAccountId,
  IMMERSVE_CLIENT_APPLICATION_ID: 'clientapp01',
  IMMERSVE_CARD_PROGRAM_ID: 'cardprog01',
  IMMERSVE_FUNDING_CHANNEL_ID: 'fundchan01',
  IMMERSVE_CLIENT_ORIGIN: 'https://card.example.com',
  IMMERSVE_NETWORK: 'ethereum-mainnet',
  TOPUP_FEE_BPS: '0',
  MIN_TOPUP_CENTS: '1',
  OPERATOR_TOKEN: 'operator-token-1',
};

function immersveFetch() {
  const calls: Array<{ url: string; method: string }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    const target = String(url);
    const method = init?.method ?? 'GET';
    calls.push({ url: target, method });
    const pathname = new URL(target).pathname;
    if (pathname === `/api/partner-profiles/${partnerAccountId}`) {
      return new Response(JSON.stringify({ accountId: partnerAccountId }), { status: 200 });
    }
    if (pathname === '/auth/login-init') {
      return new Response(JSON.stringify({ loginRequestId: 'login1', message: 'Sign in to Immersve' }), { status: 200 });
    }
    if (pathname === '/auth/login-complete') {
      return new Response(
        JSON.stringify({ accessToken: 'access-1', refreshToken: 'refresh-1', cardholderAccountId: 'acct1' }),
        { status: 200 },
      );
    }
    if (pathname === '/auth/token') {
      return new Response(JSON.stringify({ accessToken: 'access-2', refreshToken: 'refresh-2' }), { status: 200 });
    }
    if (pathname === '/api/accounts/acct1/contact-details') {
      return new Response(JSON.stringify({}), { status: 200 });
    }
    if (pathname === '/api/funding-sources' && method === 'POST') {
      return new Response(JSON.stringify({ id: 'fund1' }), { status: 200 });
    }
    if (pathname === '/api/spending-prerequisites') {
      return new Response(
        JSON.stringify({ prerequisites: [{ stage: 'funding', status: 'ok', params: { contractAddress: treasury } }] }),
        { status: 200 },
      );
    }
    if (pathname === '/api/cards' && method === 'POST') {
      return new Response(JSON.stringify({ cardId: 'card_live_1' }), { status: 200 });
    }
    if (pathname === '/api/cards/card_live_1' && method === 'GET') {
      return new Response(
        JSON.stringify({
          panLast4: '4242',
          expiry: '203012',
          status: 'active',
          network: 'mastercard',
          seriesId: 'series1',
          cardholderName: 'Ada Lovelace',
        }),
        { status: 200 },
      );
    }
    if (pathname === '/api/accounts/acct1/funding-sources') {
      return new Response(JSON.stringify({ items: [{ id: 'fund1', balance: '2500000', balanceCurrency: 'USDC' }] }), {
        status: 200,
      });
    }
    if (pathname === '/api/cards/card_live_1/pan-token') {
      return new Response(JSON.stringify({ callbackUrl: 'https://api-sec.immersve.com/api/cards/secure?tokenId=once' }), {
        status: 200,
      });
    }
    if (pathname.endsWith('/provision/apple-pay')) {
      return new Response(
        JSON.stringify({ encryptedPassData: 'enc', ephemeralPublicKey: 'eph', activationData: 'act' }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ message: `unexpected ${method} ${pathname}` }), { status: 500 });
  };
  return { fetchImpl, calls };
}

const cardBody = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: '+18005550100',
  dob: '1990-01-02',
  line1: '1 Market Street',
  city: 'San Francisco',
  state: 'CA',
  postalCode: '94105',
  country: 'US',
  type: 'virtual',
  acceptedTerms: true,
};

async function link(base: string, token: string) {
  const message = await call(base, `/api/wallet/message?address=${account.address}`, token);
  const signature = await account.signMessage({ message: String((message.data as { message: string }).message) });
  const linked = await call(base, '/api/wallet/link', token, { address: account.address, signature });
  assert.equal(linked.status, 200);
}

test('only the admin signs in and issues client cards from the desk', async () => {
  const started = await listen({ dbPath: ':memory:', prices, env: { SELF_SIGNUP: '' } });
  try {
    const closed = await call(started.base, '/api/register', undefined, { email: 'ada@example.com', password: 'correct-horse' });
    assert.equal(closed.status, 403);
    assert.equal((closed.data as { error: { code: string } }).error.code, 'signup_closed');

    const signedIn = await call(started.base, '/api/login', undefined, { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
    assert.equal(signedIn.status, 200);
    const admin = String((signedIn.data as { token: string }).token);

    const created = await call(started.base, '/api/admin/clients', admin, { email: 'grace@example.com' });
    assert.equal(created.status, 201);
    const clientId = (created.data as { client: { id: string } }).client.id;
    const duplicate = await call(started.base, '/api/admin/clients', admin, { email: 'grace@example.com' });
    assert.equal(duplicate.status, 409);

    const clientLogin = await call(started.base, '/api/login', undefined, { email: 'grace@example.com', password: 'correct-horse' });
    assert.equal(clientLogin.status, 401);

    const desk = await call(started.base, '/api/admin/desk', admin);
    const accounts = (desk.data as { accounts: Array<{ id: string; email: string; role: string }> }).accounts;
    assert.equal(accounts.find((account) => account.id === clientId)?.role, 'customer');

    const own = await call(started.base, '/api/me', admin);
    assert.equal((own.data as { user: { role: string } }).user.role, 'admin');
    const asClient = await call(started.base, '/api/me', admin, undefined, { 'x-client-id': clientId });
    assert.equal((asClient.data as { user: { email: string } }).user.email, 'grace@example.com');

    const message = await call(started.base, `/api/wallet/message?address=${account.address}`, admin, undefined, { 'x-client-id': clientId });
    assert.equal(message.status, 200);
    const signature = await account.signMessage({ message: String((message.data as { message: string }).message) });
    const linked = await call(started.base, '/api/wallet/link', admin, { address: account.address, signature }, { 'x-client-id': clientId });
    assert.equal(linked.status, 200);
    const clientMe = await call(started.base, '/api/me', admin, undefined, { 'x-client-id': clientId });
    assert.equal((clientMe.data as { wallet: { address: string } }).wallet.address, account.address.toLowerCase());

    const missing = await call(started.base, '/api/me', admin, undefined, { 'x-client-id': 'usr_missing' });
    assert.equal(missing.status, 404);
  } finally {
    await started.close();
  }
});

test('shows the networks a linked wallet holds and a QR for that address', async () => {
  const lfusd = '0x0f1b825a734bd1b885ec82780189f4534b291a28';
  const rpc: RpcClient = {
    async call(chainId, method, params) {
      if (method === 'eth_getBalance') return chainId === 1 ? `0x${(10n ** 15n).toString(16)}` : '0x0';
      if (method === 'eth_call') {
        const request = params[0] as { to?: string; data?: string };
        if (request.to?.toLowerCase() === lfusd && request.data?.startsWith('0x70a08231')) {
          return `0x${(2n * 10n ** 18n).toString(16).padStart(64, '0')}`;
        }
        return '0x0';
      }
      throw new Error(`unexpected ${method}`);
    },
  };
  const started = await listen({ dbPath: ':memory:', rpc, prices, env: { TREASURY_ADDRESS: treasury } });
  try {
    const registered = await call(started.base, '/api/register', undefined, {
      email: 'ada@example.com',
      password: 'correct-horse',
    });
    const token = String((registered.data as { token: string }).token);
    await link(started.base, token);
    const held = await call(started.base, '/api/wallet/holdings', token);
    assert.equal(held.status, 200);
    const body = held.data as {
      holdings: Array<{ symbol: string; balance: string; chainName: string }>;
      networks: Array<{ chainName: string; balance: string }>;
      qr: string;
      qrFor: string;
      address: string;
      depositAddress: string;
    };
    assert.equal(body.holdings.length, 1);
    assert.equal(body.holdings[0].symbol, 'LFUSD');
    assert.equal(body.holdings[0].balance, '2');
    assert.equal(body.holdings[0].chainName, 'Ethereum');
    assert.equal(body.networks.some((item) => item.chainName === 'Ethereum' && item.balance === '0.001'), true);
    assert.equal(body.qrFor, 'deposit');
    assert.match(body.qr, /<svg/i);
    assert.equal(body.depositAddress, treasury);
    const tokenId = `catalog_1_${lfusd.slice(2)}`;
    const code = await call(started.base, `/api/wallet/qr?tokenId=${tokenId}&amount=2`, token);
    assert.equal(code.status, 200);
    const qr = code.data as { qrFor: string; text: string; qr: string };
    assert.equal(qr.qrFor, 'transfer');
    assert.match(qr.text, new RegExp(`ethereum:${lfusd}@1/transfer\\?address=${treasury}&uint256=2000000000000000000`));
    assert.match(qr.qr, /<svg/i);
    assert.equal(JSON.stringify(code.data).includes('private'), false);
  } finally {
    await started.close();
  }
});

test('issues a live Immersve card and credits an on-chain deposit', async () => {
  const receipt = { current: null as unknown };
  const immersve = immersveFetch();
  const started = await listen({
    dbPath: ':memory:',
    rpc: chainRpc(receipt),
    prices,
    fetchImpl: immersve.fetchImpl,
    env: liveEnv,
  });
  try {
    const registered = await call(started.base, '/api/register', undefined, {
      email: 'ada@example.com',
      password: 'correct-horse',
    });
    assert.equal(registered.status, 201);
    const token = String((registered.data as { token: string }).token);
    await link(started.base, token);

    const needsSignature = await call(started.base, '/api/card', token, cardBody);
    assert.equal(needsSignature.status, 200);
    assert.equal((needsSignature.data as { status: string }).status, 'signature_required');
    const walletSignature = await account.signMessage({
      message: String((needsSignature.data as { message: string }).message),
    });
    const issued = await call(started.base, '/api/card', token, { ...cardBody, walletSignature });
    assert.equal(issued.status, 201);
    const card = (issued.data as { card: { last4: string; brand: string; issuerCardId: string; id: string } }).card;
    assert.equal(card.last4, '4242');
    assert.equal(card.brand, 'mastercard');
    assert.equal(card.issuerCardId, 'card_live_1');

    const custom = await call(started.base, '/api/tokens', token, { chainId: 1, address: dead });
    assert.equal(custom.status, 201);
    const tokenId = (custom.data as { token: { id: string } }).token.id;
    const tx = `0x${'ab'.repeat(32)}`;
    receipt.current = {
      status: '0x1',
      logs: [
        {
          address: dead,
          topics: [
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
            `0x${account.address.slice(2).toLowerCase().padStart(64, '0')}`,
            `0x${treasury.slice(2).padStart(64, '0')}`,
          ],
          data: `0x${(10n ** 18n).toString(16).padStart(64, '0')}`,
          logIndex: '0x0',
        },
      ],
    };
    const confirmed = await call(started.base, '/api/topups/confirm', token, { tokenId, txHash: tx });
    assert.equal(confirmed.status, 200);
    assert.equal((confirmed.data as { creditedCents: number }).creditedCents, 250);

    const apple = await call(started.base, '/api/wallets/apple', token, {
      cardId: card.id,
      certChain: ['Y2VydA=='],
      nonce: 'bm9uY2U=',
      nonceSignature: 'c2ln',
    });
    assert.equal(apple.status, 200);
    assert.equal((apple.data as { encryptedPassData: string }).encryptedPassData, 'enc');

    const secure = await call(started.base, '/api/wallets/secure-details', token, {});
    assert.equal(secure.status, 200);
    assert.match(String((secure.data as { callbackUrl: string }).callbackUrl), /^https:\/\/api-sec\.immersve\.com\//);

    const configResponse = await fetch(`${started.base}/api/config`);
    const configText = await configResponse.text();
    assert.equal(configText.includes(liveSecret), false);
    assert.equal(configText.includes(liveKey), false);
    const me = await call(started.base, '/api/me', token);
    assert.equal((me.data as { balance: { availableCents: number } }).balance.availableCents, 250);
    assert.equal((me.data as { card: { last4: string } }).card.last4, '4242');
  } finally {
    await started.close();
  }
});

test('public config hides Immersve secrets and refuses a test key', async () => {
  const started = await listen({
    dbPath: ':memory:',
    env: { IMMERSVE_API_KEY: 'imm-key-test-publicsandbox', IMMERSVE_API_SECRET: 'imm-secret-test-publicsandbox' },
  });
  try {
    const response = await fetch(`${started.base}/api/config`);
    const text = await response.text();
    assert.equal(text.includes('imm-secret-test-publicsandbox'), false);
    const body = JSON.parse(text) as { livemode: boolean; issuer: string; readiness: Array<{ id: string; ready: boolean }> };
    assert.equal(body.livemode, false);
    assert.equal(body.issuer, 'unconfigured');
    assert.equal(body.readiness.find((item) => item.id === 'card_issuer')?.ready, false);
    const registered = await call(started.base, '/api/register', undefined, {
      email: 'ada@example.com',
      password: 'correct-horse',
    });
    const token = String((registered.data as { token: string }).token);
    const issued = await call(started.base, '/api/card', token, cardBody);
    assert.equal(issued.status, 400);
    assert.equal((issued.data as { error: { code: string } }).error.code, 'live_key_required');
  } finally {
    await started.close();
  }
});

test('setup stores a live Immersve key and keeps it out of the public config', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'offlinerich-'));
  const dbPath = path.join(dir, 'card.sqlite');
  const immersve = immersveFetch();
  const first = await listen({ dbPath, fetchImpl: immersve.fetchImpl, env: {} });
  const setupBody = {
    apiKey: liveKey,
    apiSecret: liveSecret,
    partnerAccountId,
    clientApplicationId: 'clientapp01',
    cardProgramId: 'cardprog01',
    fundingChannelId: 'fundchan01',
    clientOrigin: 'https://card.example.com',
    network: 'ethereum-mainnet',
  };
  try {
    const registered = await call(first.base, '/api/register', undefined, {
      email: 'ada@example.com',
      password: 'correct-horse',
    });
    const customer = String((registered.data as { token: string }).token);
    const blocked = await call(first.base, '/api/setup', customer, setupBody);
    assert.equal(blocked.status, 403);
    const customerDesk = await call(first.base, '/api/admin/desk', customer);
    assert.equal(customerDesk.status, 403);
    assert.equal((blocked.data as { error: { code: string } }).error.code, 'admin_required');
    const signedIn = await call(first.base, '/api/login', undefined, {
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
    });
    const token = String((signedIn.data as { token: string }).token);
    const desk = await call(first.base, '/api/admin/desk', token);
    assert.equal(desk.status, 200);
    const accounts = (desk.data as { accounts: Array<{ username: string; email: string }> }).accounts;
    assert.equal(accounts.some((account) => account.username === ADMIN_USERNAME), true);
    assert.equal(accounts.some((account) => account.email === 'ada@example.com'), true);
    assert.equal(JSON.stringify(desk.data).includes(ADMIN_PASSWORD), false);
    const testKey = await call(first.base, '/api/setup', token, {
      ...setupBody,
      apiKey: 'imm-key-test-nope',
      apiSecret: 'imm-secret-test-nope',
    });
    assert.equal(testKey.status, 400);
    assert.equal((testKey.data as { error: { code: string } }).error.code, 'live_key_required');
    assert.equal(immersve.calls.length, 0);

    const connected = await call(first.base, '/api/setup', token, setupBody);
    assert.equal(connected.status, 200);
    assert.equal((connected.data as { livemode: boolean }).livemode, true);
    assert.equal(JSON.stringify(connected.data).includes(liveSecret), false);
    assert.ok(immersve.calls.some((entry) => entry.url.includes(`/api/partner-profiles/${partnerAccountId}`)));

    const again = await call(first.base, '/api/setup', token, { ...setupBody, apiKey: 'imm-key-liveother' });
    assert.equal(again.status, 409);
  } finally {
    await first.close();
  }

  const second = await listen({ dbPath, fetchImpl: immersve.fetchImpl, env: {} });
  try {
    const response = await fetch(`${second.base}/api/config`);
    const text = await response.text();
    const body = JSON.parse(text) as { livemode: boolean; issuer: string; network: string };
    assert.equal(body.livemode, true);
    assert.equal(body.issuer, 'immersve');
    assert.equal(body.network, 'ethereum-mainnet');
    assert.equal(text.includes(liveSecret), false);
    assert.equal(text.includes(liveKey), false);
  } finally {
    await second.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


test('Pay2.House connect issues a client card and shows the number', async () => {
  const { privateKey, publicKey } = await import('node:crypto').then((crypto) =>
    crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    }),
  );
  void publicKey;
  const pay2 = {
    calls: [] as Array<{ url: string; body: string }>,
    async fetchImpl(input: RequestInfo | URL, init?: RequestInit) {
      const url = String(input);
      const body = String(init?.body ?? '');
      pay2.calls.push({ url, body });
      if (url.includes('/wallets')) {
        return new Response(
          JSON.stringify({
            status: 'success',
            code: 'REQUEST_SUCCESS',
            wallets: [{ account_number: 'P2U12345678', name: 'USD', balance: 120, currency_code: 'USD', trc20_address: 'TXtest' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/cards/issue')) {
        return new Response(
          JSON.stringify({ status: 'success', code: 'REQUEST_SUCCESS', card_id: 'VC999', card_number: '5412751234123456' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/cards/details')) {
        return new Response(
          JSON.stringify({
            status: 'success',
            code: 'REQUEST_SUCCESS',
            card_id: 'VC999',
            card_number: '5412751234123456',
            cvv: '123',
            expiration_date: '09/29',
            password: '4455',
            balance: 25,
            card_status: 'active',
            currency_code: 'USD',
            first_name: 'Ada',
            last_name: 'Lovelace',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ status: 'error', code: 'UNKNOWN', msg: url }), { status: 500 });
    },
  };
  const started = await listen({ dbPath: ':memory:', fetchImpl: pay2.fetchImpl as typeof fetch, env: { SELF_SIGNUP: '' } });
  try {
    const signedIn = await call(started.base, '/api/login', undefined, {
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
    });
    const token = String((signedIn.data as { token: string }).token);
    const connected = await call(started.base, '/api/setup/pay2', token, {
      apiKey: 'pay2-test-key',
      keyId: 'key-1',
      privateKeyPem: privateKey,
      accountNumber: 'P2U12345678',
      binNumber: '54127500',
    });
    assert.equal(connected.status, 200);
    assert.equal((connected.data as { issuer: string }).issuer, 'pay2');
    const created = await call(started.base, '/api/admin/clients', token, { email: 'pay2client@example.com' });
    assert.equal(created.status, 201);
    const clientId = String((created.data as { client: { id: string } }).client.id);
    const issued = await call(
      started.base,
      '/api/card',
      token,
      {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'pay2client@example.com',
        phone: '18005550100',
        dob: '1990-01-02',
        line1: '1 Street',
        city: 'Austin',
        state: 'TX',
        postalCode: '78701',
        country: 'US',
        type: 'virtual',
        acceptedTerms: true,
      },
      { 'x-client-id': clientId },
    );
    assert.equal(issued.status, 201);
    assert.equal((issued.data as { status: string }).status, 'issued');
    assert.equal((issued.data as { card: { last4: string; issuerMode: string } }).card.last4, '3456');
    assert.equal((issued.data as { card: { issuerMode: string } }).card.issuerMode, 'pay2');
    const secure = await call(started.base, '/api/wallets/secure-details', token, {}, { 'x-client-id': clientId });
    assert.equal(secure.status, 200);
    assert.equal((secure.data as { mode: string }).mode, 'pay2');
    assert.match(String((secure.data as { pan: string }).pan), /5412/);
    const cfg = await fetch(`${started.base}/api/config`);
    const body = (await cfg.json()) as { issuer: string; pay2Ready: boolean };
    assert.equal(body.issuer, 'pay2');
    assert.equal(body.pay2Ready, true);
  } finally {
    await started.close();
  }
});
