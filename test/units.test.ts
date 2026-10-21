import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeAbiString, decodeTransfers } from '../src/abi.ts';
import { createStripeIssuer } from '../src/issuer.ts';
import { decideSpend, normalizePhone, settlePrice, usdCents } from '../src/money.ts';
import { visaXPayToken } from '../src/visa.ts';

test('decodes ERC-20 strings and bytes32 symbols', () => {
  const word = Buffer.alloc(32);
  Buffer.from('USDT').copy(word);
  assert.equal(decodeAbiString(`0x${word.toString('hex')}`), 'USDT');
  const dynamic = `0x${'20'.padStart(64, '0')}${'4'.padStart(64, '0')}${Buffer.from('TEST').toString('hex').padEnd(64, '0')}`;
  assert.equal(decodeAbiString(dynamic), 'TEST');
});

test('prices a token deposit in cents and keeps the peg inside a cent', () => {
  assert.deepEqual(usdCents(10n ** 18n, 18, 2.5, 0), { grossCents: 250, feeCents: 0, netCents: 250 });
  assert.equal(usdCents(10n ** 18n, 18, 2.5, 100).netCents, 247);
  assert.equal(settlePrice(true, null), 1);
  assert.equal(settlePrice(true, { price: 0.999, confidence: 0.99 }), 1);
  assert.equal(settlePrice(true, { price: 0.94, confidence: 0.99 }), 0.94);
  assert.equal(settlePrice(false, { price: 2, confidence: 0.2 }), null);
});

test('accepts a phone number with spaces, dashes, or a missing plus', () => {
  assert.equal(normalizePhone('+1 800 555 0100'), '+18005550100');
  assert.equal(normalizePhone('(800) 555-0100'), '+18005550100');
  assert.equal(normalizePhone('18005550100'), '+18005550100');
  assert.equal(normalizePhone('+44 7700 900123'), '+447700900123');
  assert.equal(normalizePhone('123'), null);
});

test('approves a worldwide charge only when the balance covers it', () => {
  const base = { cardStatus: 'active', availableCents: 500, blockedCountries: ['KP'] };
  assert.equal(decideSpend({ ...base, amountCents: 500, merchantCountry: 'BR' }).approved, true);
  assert.equal(decideSpend({ ...base, amountCents: 501, merchantCountry: 'DE' }).reason, 'insufficient_balance');
  assert.equal(decideSpend({ ...base, amountCents: 100, merchantCountry: 'kp' }).reason, 'country_blocked');
  assert.equal(decideSpend({ ...base, cardStatus: 'inactive', amountCents: 100, merchantCountry: 'US' }).reason, 'card_inactive');
});

test('builds the Visa x-pay-token used by Samsung Pay', () => {
  assert.equal(
    visaXPayToken({
      sharedSecret: 'secret',
      resourcePath: 'provisioning/cardData/samsungPay',
      query: 'apikey=key',
      body: '{}',
      timestamp: 1700000000,
    }),
    'xv2:1700000000:b20ce348cce8f733d26fbc887a69570f643afbe30f32c90b300849d673518282',
  );
});

test('asks Stripe for an issuing-card ephemeral key', async () => {
  const calls: Array<{ url: string; version: string | null; body: string }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(url), version: headers.get('stripe-version'), body: String(init?.body ?? '') });
    return new Response(
      JSON.stringify({ id: 'ephkey_123', object: 'ephemeral_key', secret: 'ek_test_secret', expires: 2 }),
      { status: 200 },
    );
  };
  const issuer = createStripeIssuer({ secretKey: 'sk_test_x', apiVersion: '2026-09-30.endive', fetchImpl });
  const key = await issuer.createEphemeralKey({ cardId: 'ic_123', apiVersion: '2024-06-20', nonce: 'nonce_abc' });
  assert.equal(calls[0]?.url, 'https://api.stripe.com/v1/ephemeral_keys');
  assert.equal(calls[0]?.version, '2024-06-20');
  assert.match(calls[0]?.body ?? '', /issuing_card=ic_123/);
  assert.match(calls[0]?.body ?? '', /nonce=nonce_abc/);
  assert.equal(key.ephemeralKeySecret, 'ek_test_secret');
  assert.equal(key.api_version, '2024-06-20');
});

test('reads a transfer log for the treasury', () => {
  const token = '0x000000000000000000000000000000000000dead';
  const from = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
  const to = '0x1111111111111111111111111111111111111111';
  const transfers = decodeTransfers(
    {
      logs: [
        {
          address: token,
          topics: [
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
            `0x${from.slice(2).padStart(64, '0')}`,
            `0x${to.slice(2).padStart(64, '0')}`,
          ],
          data: `0x${(10n ** 18n).toString(16).padStart(64, '0')}`,
          logIndex: '0x0',
        },
      ],
    },
    token.toUpperCase(),
  );
  assert.equal(transfers.length, 1);
  assert.equal(transfers[0]?.from, from);
  assert.equal(transfers[0]?.to, to);
  assert.equal(transfers[0]?.amount, 10n ** 18n);
});
