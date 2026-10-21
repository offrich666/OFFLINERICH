import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { privateKeyToAccount } from 'viem/accounts';
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
  const app = createApp(options);
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
    method: body === undefined && !extraHeaders?.['stripe-signature'] ? 'GET' : 'POST',
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

const liveSecret = 'sk_live_supersecret';
const livePublishable = 'pk_live_public';

function stripeFetch() {
  const calls: Array<{ url: string; method: string; body: string }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    const target = String(url);
    const method = init?.method ?? 'GET';
    const body = String(init?.body ?? '');
    calls.push({ url: target, method, body });
    const pathname = new URL(target).pathname;
    if (pathname === '/v1/issuing/cardholders' && method === 'GET') {
      return new Response(JSON.stringify({ object: 'list', data: [] }), { status: 200 });
    }
    if (pathname === '/v1/issuing/cardholders' && method === 'POST') {
      return new Response(JSON.stringify({ id: 'ich_live_1' }), { status: 200 });
    }
    if (pathname === '/v1/issuing/cards' && method === 'POST') {
      return new Response(
        JSON.stringify({ id: 'ic_live_1', last4: '4242', exp_month: 12, exp_year: 2030, brand: 'visa', status: 'inactive' }),
        { status: 200 },
      );
    }
    if (pathname.startsWith('/v1/issuing/cards/')) {
      return new Response(JSON.stringify({ id: 'ic_live_1' }), { status: 200 });
    }
    if (pathname === '/v1/ephemeral_keys') {
      return new Response(JSON.stringify({ id: 'ephkey_1', object: 'ephemeral_key', secret: 'ek_live_secret' }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { message: `unexpected ${method} ${pathname}` } }), { status: 500 });
  };
  return { fetchImpl, calls };
}

function sign(secret: string, payload: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
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

async function webhook(base: string, secret: string, body: unknown) {
  const payload = JSON.stringify(body);
  return call(base, '/api/webhooks/stripe', undefined, payload, { 'stripe-signature': sign(secret, payload) });
}

test('issues a live card, values a deposit, and approves a real authorization', async () => {
  const receipt = { current: null as unknown };
  const stripe = stripeFetch();
  const started = await listen({
    dbPath: ':memory:',
    rpc: chainRpc(receipt),
    prices,
    fetchImpl: stripe.fetchImpl,
    env: {
      STRIPE_SECRET_KEY: liveSecret,
      STRIPE_PUBLISHABLE_KEY: livePublishable,
      TREASURY_ADDRESS: treasury,
      TOPUP_FEE_BPS: '0',
      MIN_TOPUP_CENTS: '1',
      BLOCKED_MERCHANT_COUNTRIES: 'KP',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      OPERATOR_TOKEN: 'operator-token-1',
    },
  });
  try {
    const registered = await call(started.base, '/api/register', undefined, {
      email: 'ada@example.com',
      password: 'correct-horse',
    });
    assert.equal(registered.status, 201);
    const token = String((registered.data as { token: string }).token);

    const removedTopup = await call(started.base, '/api/topups/simulate', token, { amount: '10' });
    assert.equal(removedTopup.status, 404);
    const removedPurchase = await call(started.base, '/api/purchases/simulate', token, { amount: '1.00' });
    assert.equal(removedPurchase.status, 404);

    const refused = await call(started.base, '/api/card', token, { ...cardBody, acceptedTerms: false });
    assert.equal(refused.status, 400);

    const issued = await call(started.base, '/api/card', token, cardBody);
    assert.equal(issued.status, 201);
    const card = (issued.data as { card: { status: string; last4: string; issuerCardId: string; id: string } }).card;
    assert.equal(card.status, 'inactive');
    assert.equal(card.last4, '4242');
    assert.equal(card.issuerCardId, 'ic_live_1');
    assert.ok(stripe.calls.some((entry) => entry.url.endsWith('/v1/issuing/cards') && entry.method === 'POST'));

    const early = await webhook(started.base, 'whsec_test', {
      id: 'evt_early',
      type: 'issuing_authorization.request',
      data: {
        object: {
          id: 'iauth_early',
          card: card.issuerCardId,
          pending_request: { amount: 450, currency: 'usd' },
          merchant_data: { name: 'Kissaten', country: 'JP' },
        },
      },
    });
    assert.equal((early.data as { approved: boolean }).approved, false);

    const catalog = await call(started.base, '/api/tokens', token, {
      chainId: 8453,
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    });
    assert.equal(catalog.status, 201);
    assert.equal((catalog.data as { token: { symbol: string } }).token.symbol, 'USDC');

    const custom = await call(started.base, '/api/tokens', token, { chainId: 1, address: dead });
    assert.equal(custom.status, 201);
    assert.equal((custom.data as { token: { symbol: string; decimals: number } }).token.decimals, 18);
    const tokenId = (custom.data as { token: { id: string } }).token.id;

    const junk = await call(started.base, '/api/tokens', token, {
      chainId: 1,
      address: '0x0000000000000000000000000000000000000001',
    });
    assert.equal(junk.status, 400);

    const message = await call(started.base, `/api/wallet/message?address=${account.address}`, token);
    const signature = await account.signMessage({ message: String((message.data as { message: string }).message) });
    const linked = await call(started.base, '/api/wallet/link', token, { address: account.address, signature });
    assert.equal(linked.status, 200);

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
    assert.equal((confirmed.data as { balance: { available: number } }).balance.available, 250);

    const again = await call(started.base, '/api/topups/confirm', token, { tokenId, txHash: tx });
    assert.equal((again.data as { alreadyCredited: boolean }).alreadyCredited, true);

    receipt.current = {
      status: '0x1',
      logs: [
        {
          address: dead,
          topics: [
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
            `0x${'22'.repeat(20).padStart(64, '0')}`,
            `0x${treasury.slice(2).padStart(64, '0')}`,
          ],
          data: `0x${(10n ** 18n).toString(16).padStart(64, '0')}`,
          logIndex: '0x0',
        },
      ],
    };
    const stranger = await call(started.base, '/api/topups/confirm', token, {
      tokenId,
      txHash: `0x${'cd'.repeat(32)}`,
    });
    assert.equal(stranger.status, 400);

    const berlin = await webhook(started.base, 'whsec_test', {
      id: 'evt_berlin',
      type: 'issuing_authorization.request',
      data: {
        object: {
          id: 'iauth_live_1',
          card: card.issuerCardId,
          pending_request: { amount: 100, currency: 'usd' },
          merchant_data: { name: 'Berlin Bäckerei', country: 'DE' },
        },
      },
    });
    assert.equal((berlin.data as { approved: boolean }).approved, true);

    const blocked = await webhook(started.base, 'whsec_test', {
      id: 'evt_blocked',
      type: 'issuing_authorization.request',
      data: {
        object: {
          id: 'iauth_blocked',
          card: card.issuerCardId,
          pending_request: { amount: 100, currency: 'usd' },
          merchant_data: { name: 'Blocked', country: 'KP' },
        },
      },
    });
    assert.equal((blocked.data as { approved: boolean }).approved, false);

    const apple = await call(started.base, '/api/wallets/apple', token, {});
    assert.equal(apple.status, 200);
    assert.equal((apple.data as { primaryAccountSuffix: string }).primaryAccountSuffix, '4242');
    assert.equal((apple.data as { push: { available: boolean } }).push.available, true);

    const key = await call(started.base, '/api/wallets/ephemeral-key', token, {
      cardId: card.id,
      apiVersion: '2024-06-20',
      nonce: 'nonce_abc',
    });
    assert.equal(key.status, 200);
    assert.equal((key.data as { ephemeralKeySecret: string }).ephemeralKeySecret, 'ek_live_secret');

    const configResponse = await fetch(`${started.base}/api/config`);
    const configText = await configResponse.text();
    assert.equal(configText.includes(liveSecret), false);
    assert.equal(configText.includes('ek_live_secret'), false);
    assert.equal(configText.includes('whsec_test'), false);

    const samsung = await call(started.base, '/api/wallets/samsung', token, {});
    assert.ok(((samsung.data as { missing: string[] }).missing).some((item) => item.includes('VISA_API_KEY')));

    const me = await call(started.base, '/api/me', token);
    assert.equal((me.data as { balance: { availableCents: number } }).balance.availableCents, 150);
    assert.equal((me.data as { card: { status: string } }).card.status, 'active');

    const hidden = await call(started.base, '/api/operator/obligations');
    assert.equal(hidden.status, 401);
    const obligations = await call(started.base, '/api/operator/obligations', 'operator-token-1');
    assert.equal((obligations.data as { creditedCents: number }).creditedCents, 250);
  } finally {
    await started.close();
  }
});

test('public config hides secrets and refuses a test key', async () => {
  const started = await listen({
    dbPath: ':memory:',
    env: { STRIPE_SECRET_KEY: 'sk_test_supersecret', STRIPE_PUBLISHABLE_KEY: 'pk_test_public' },
  });
  try {
    const response = await fetch(`${started.base}/api/config`);
    const text = await response.text();
    assert.equal(text.includes('sk_test_supersecret'), false);
    const body = JSON.parse(text) as {
      livemode: boolean;
      issuer: string;
      stripePublishableKey: string;
      wallets: { googlePay: { aggregatorMerchantId: string } };
      readiness: Array<{ id: string; ready: boolean }>;
    };
    assert.equal(body.livemode, false);
    assert.equal(body.issuer, 'unconfigured');
    assert.equal(body.stripePublishableKey, '');
    assert.equal(body.wallets.googlePay.aggregatorMerchantId, 'BCR2DN7TWDCZDZJC');
    assert.equal(body.readiness.find((item) => item.id === 'stripe_issuing')?.ready, false);

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

test('setup stores a live key and keeps it out of the public config', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'offlinerich-'));
  const dbPath = path.join(dir, 'card.sqlite');
  const stripe = stripeFetch();
  const first = await listen({ dbPath, fetchImpl: stripe.fetchImpl, env: {} });
  try {
    const registered = await call(first.base, '/api/register', undefined, {
      email: 'ada@example.com',
      password: 'correct-horse',
    });
    const token = String((registered.data as { token: string }).token);
    const testKey = await call(first.base, '/api/setup', token, {
      stripeSecretKey: 'sk_test_nope',
      stripePublishableKey: 'pk_test_public',
      stripeWebhookSecret: 'whsec_test',
      treasuryAddress: treasury,
    });
    assert.equal(testKey.status, 400);
    assert.equal((testKey.data as { error: { code: string } }).error.code, 'live_key_required');
    assert.equal(stripe.calls.length, 0);

    const connected = await call(first.base, '/api/setup', token, {
      stripeSecretKey: liveSecret,
      stripePublishableKey: livePublishable,
      stripeWebhookSecret: 'whsec_test',
      treasuryAddress: treasury,
    });
    assert.equal(connected.status, 200);
    assert.equal((connected.data as { livemode: boolean }).livemode, true);
    assert.equal(JSON.stringify(connected.data).includes(liveSecret), false);
    assert.ok(stripe.calls.some((entry) => entry.url.includes('/v1/issuing/cardholders?limit=1')));

    const again = await call(first.base, '/api/setup', token, {
      stripeSecretKey: 'sk_live_other',
      stripePublishableKey: livePublishable,
      stripeWebhookSecret: 'whsec_test',
      treasuryAddress: treasury,
    });
    assert.equal(again.status, 409);

    const issued = await call(first.base, '/api/card', token, cardBody);
    assert.equal(issued.status, 201);
    assert.equal((issued.data as { card: { last4: string } }).card.last4, '4242');
  } finally {
    await first.close();
  }

  const second = await listen({ dbPath, fetchImpl: stripe.fetchImpl, env: {} });
  try {
    const response = await fetch(`${second.base}/api/config`);
    const text = await response.text();
    const body = JSON.parse(text) as { livemode: boolean; stripePublishableKey: string; treasuryAddress: string };
    assert.equal(body.livemode, true);
    assert.equal(body.stripePublishableKey, livePublishable);
    assert.equal(body.treasuryAddress, treasury);
    assert.equal(text.includes(liveSecret), false);
    assert.equal(text.includes('whsec_test'), false);
  } finally {
    await second.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
