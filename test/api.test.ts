import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
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
        close: () => new Promise((done) => server.close(() => done())),
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

test('issues a card, values a custom token, and spends worldwide', async () => {
  const receipt = { current: null as unknown };
  const started = await listen({
    dbPath: ':memory:',
    rpc: chainRpc(receipt),
    prices,
    env: {
      TREASURY_ADDRESS: treasury,
      TOPUP_FEE_BPS: '0',
      MIN_TOPUP_CENTS: '1',
      BLOCKED_MERCHANT_COUNTRIES: 'KP',
      ALLOW_SIMULATED_TOPUPS: 'true',
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

    const refused = await call(started.base, '/api/card', token, { ...cardBody, acceptedTerms: false });
    assert.equal(refused.status, 400);

    const issued = await call(started.base, '/api/card', token, cardBody);
    assert.equal(issued.status, 201);
    const card = (issued.data as { card: { status: string; last4: string; issuerCardId: string; id: string } }).card;
    assert.equal(card.status, 'inactive');
    assert.match(card.last4, /^\d{4}$/);

    const early = await call(started.base, '/api/purchases/simulate', token, {
      amount: '4.50',
      merchantName: 'Kissaten',
      merchantCountry: 'JP',
    });
    assert.equal((early.data as { reason: string }).reason, 'card_inactive');

    const catalog = await call(started.base, '/api/tokens', token, {
      chainId: 8453,
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    });
    assert.equal(catalog.status, 201);
    assert.equal((catalog.data as { token: { symbol: string } }).token.symbol, 'USDC');

    const tokens = await call(started.base, '/api/tokens', token);
    const usdc = ((tokens.data as { tokens: Array<{ symbol: string; chainId: number; id: string }> }).tokens).find(
      (entry) => entry.symbol === 'USDC' && entry.chainId === 8453,
    );
    assert.ok(usdc);

    const topped = await call(started.base, '/api/topups/simulate', token, { tokenId: usdc?.id, amount: '10' });
    assert.equal(topped.status, 200);
    assert.equal((topped.data as { creditedCents: number }).creditedCents, 1000);

    const japan = await call(started.base, '/api/purchases/simulate', token, {
      amount: '4.50',
      merchantName: 'Kissaten',
      merchantCountry: 'JP',
    });
    assert.equal((japan.data as { approved: boolean }).approved, true);
    assert.equal((japan.data as { balance: { available: number } }).balance.available, 550);

    const blocked = await call(started.base, '/api/purchases/simulate', token, {
      amount: '1.00',
      merchantName: 'Blocked',
      merchantCountry: 'KP',
    });
    assert.equal((blocked.data as { reason: string }).reason, 'country_blocked');
    assert.equal((blocked.data as { balance: { available: number } }).balance.available, 550);

    const custom = await call(started.base, '/api/tokens', token, { chainId: 1, address: dead });
    assert.equal(custom.status, 201);
    assert.equal((custom.data as { token: { symbol: string; decimals: number } }).token.decimals, 18);
    const tokenId = (custom.data as { token: { id: string } }).token.id;

    const junk = await call(started.base, '/api/tokens', token, {
      chainId: 1,
      address: '0x0000000000000000000000000000000000000001',
    });
    assert.equal(junk.status, 400);

    const message = await call(
      started.base,
      `/api/wallet/message?address=${account.address}`,
      token,
    );
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
    assert.equal((confirmed.data as { balance: { available: number } }).balance.available, 800);

    const again = await call(started.base, '/api/topups/confirm', token, { tokenId, txHash: tx });
    assert.equal((again.data as { alreadyCredited: boolean }).alreadyCredited, true);
    assert.equal((again.data as { balance: { available: number } }).balance.available, 800);

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

    const apple = await call(started.base, '/api/wallets/apple', token, {});
    assert.equal(apple.status, 200);
    assert.equal((apple.data as { primaryAccountSuffix: string }).primaryAccountSuffix, card.last4);
    assert.equal((apple.data as { push: { endpoint: string } }).push.endpoint, '/api/wallets/ephemeral-key');

    const key = await call(started.base, '/api/wallets/ephemeral-key', token, { cardId: card.id, apiVersion: '2024-06-20' });
    assert.equal(key.status, 409);

    const samsung = await call(started.base, '/api/wallets/samsung', token, {});
    assert.ok(((samsung.data as { missing: string[] }).missing).some((item) => item.includes('VISA_API_KEY')));

    const payload = JSON.stringify({
      id: 'evt_1',
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
    const timestamp = Math.floor(Date.now() / 1000);
    const signed = createHmac('sha256', 'whsec_test').update(`${timestamp}.${payload}`).digest('hex');
    const webhook = await call(started.base, '/api/webhooks/stripe', undefined, payload, {
      'stripe-signature': `t=${timestamp},v1=${signed}`,
    });
    assert.equal((webhook.data as { approved: boolean }).approved, true);

    const me = await call(started.base, '/api/me', token);
    assert.equal((me.data as { balance: { availableCents: number } }).balance.availableCents, 700);
    assert.equal((me.data as { card: { status: string } }).card.status, 'active');

    const hidden = await call(started.base, '/api/operator/obligations');
    assert.equal(hidden.status, 401);
    const obligations = await call(started.base, '/api/operator/obligations', 'operator-token-1');
    assert.equal((obligations.data as { creditedCents: number }).creditedCents, 1250);
  } finally {
    await started.close();
  }
});

test('public config lists wallet APIs and hides secrets', async () => {
  const started = await listen({
    dbPath: ':memory:',
    env: { STRIPE_SECRET_KEY: 'sk_test_supersecret', STRIPE_PUBLISHABLE_KEY: 'pk_test_public' },
  });
  try {
    const response = await fetch(`${started.base}/api/config`);
    const text = await response.text();
    assert.equal(text.includes('sk_test_supersecret'), false);
    const body = JSON.parse(text) as {
      stripePublishableKey: string;
      wallets: { googlePay: { aggregatorMerchantId: string } };
      readiness: Array<{ id: string }>;
    };
    assert.equal(body.stripePublishableKey, 'pk_test_public');
    assert.equal(body.wallets.googlePay.aggregatorMerchantId, 'BCR2DN7TWDCZDZJC');
    assert.ok(body.readiness.some((item) => item.id === 'samsung_pay'));
  } finally {
    await started.close();
  }
});
