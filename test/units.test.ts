import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeAbiString, decodeTransfers } from '../src/abi.ts';
import { centsFromFundingBalance, createImmersveIssuer } from '../src/issuer.ts';
import { findCatalog } from '../src/chains.ts';
import { formatTokenAmount } from '../src/erc20.ts';
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

test('prices one LFUSD at one dollar, the same rule as USDT', () => {
  const token = findCatalog(1, '0x0f1b825a734Bd1b885EC82780189F4534b291A28');
  assert.ok(token);
  assert.equal(token.symbol, 'LFUSD');
  assert.equal(token.decimals, 18);
  assert.equal(token.pegged, true);
  assert.equal(usdCents(10n ** 18n, token.decimals, settlePrice(true, null) ?? 0, 100).netCents, 99);
  assert.equal(formatTokenAmount(2n * 10n ** 18n, 18), '2');
  assert.equal(formatTokenAmount(10n ** 15n, 18), '0.001');
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

test('asks Immersve for an Apple Pay payload and reads a USDC balance', async () => {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    return new Response(
      JSON.stringify({ encryptedPassData: 'enc', ephemeralPublicKey: 'key', activationData: 'act' }),
      { status: 200 },
    );
  };
  const issuer = createImmersveIssuer({
    apiKey: 'imm-key-liveexample',
    apiSecret: 'imm-secret-liveexample',
    clientApplicationId: 'clientapp1',
    partnerAccountId: 'partneracc1',
    cardProgramId: 'cardprogram1',
    fundingChannelId: 'fundingchan1',
    clientOrigin: 'https://card.example.com',
    network: 'ethereum-mainnet',
    fetchImpl,
  });
  const payload = await issuer.provisionApplePay('access-token', 'card_123', {
    certChain: ['Y2VydA=='],
    nonce: 'bm9uY2U=',
    nonceSignature: 'c2ln',
  });
  assert.equal(calls[0], 'POST https://api.immersve.com/api/cards/card_123/provision/apple-pay');
  assert.equal(payload.encryptedPassData, 'enc');
  assert.equal(centsFromFundingBalance('1000000', 'USDC'), 100);
  assert.equal(centsFromFundingBalance('250', 'USD'), 250);
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
