import crypto from 'node:crypto';
import { HttpError } from './errors.ts';

export const PAY2_BASE = 'https://pay2.house/api';

export type Pay2Wallet = {
  accountNumber: string;
  name: string;
  balance: number;
  currencyCode: string;
  trc20Address: string;
};

export type Pay2Bin = {
  bin: string;
  currencyCode: string;
  countryCode: string;
  cardType: string;
  cardNetwork: string;
  cardProductType: string;
  verificationRequired: number;
};

export type Pay2IssuedCard = {
  cardId: string;
  cardNumber: string;
};

export type Pay2CardDetails = {
  cardId: string;
  cardNumber: string;
  cvv: string;
  expirationDate: string;
  password: string;
  balance: number;
  cardStatus: string;
  currencyCode: string;
  firstName: string;
  lastName: string;
};

export type Pay2Client = {
  mode: 'pay2';
  probe(): Promise<{ wallets: Pay2Wallet[] }>;
  listBins(input: {
    currencyCode?: string;
    countryCode?: string;
    cardNetwork?: string;
    cardProductType?: string;
  }): Promise<Pay2Bin[]>;
  issueCard(input: {
    accountNumber: string;
    firstName: string;
    lastName: string;
    surName: string;
    dateBirth: string;
    phoneNumber: string;
    address: string;
    city: string;
    region: string;
    postCode: string;
    email: string;
    countryCode: string;
    binNumber: string;
  }): Promise<Pay2IssuedCard>;
  cardDetails(cardId: string): Promise<Pay2CardDetails>;
  topUp(cardId: string, accountNumber: string, amount: number): Promise<{ transactionNumber: string }>;
};

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64url');
}

export function signPay2Token(
  privateKeyPem: string,
  keyId: string,
  data: Record<string, unknown>,
  nowSec = Math.floor(Date.now() / 1000),
): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = { key_id: keyId, iat: nowSec, data };
  const encoded = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(encoded);
  signer.end();
  const signature = signer.sign(privateKeyPem);
  return `${encoded}.${b64url(signature)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function createPay2Client(input: {
  apiKey: string;
  keyId: string;
  privateKeyPem: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}): Pay2Client {
  const fetchImpl = input.fetchImpl ?? fetch;
  const base = (input.baseUrl || PAY2_BASE).replace(/\/$/, '');

  async function post(path: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined || value === null || value === '') continue;
      cleaned[key] = value;
    }
    let signToken: string;
    try {
      signToken = signPay2Token(input.privateKeyPem, input.keyId, cleaned);
    } catch {
      throw new HttpError(400, 'pay2_key_invalid', 'The Pay2.House private key could not sign the request. Paste the full PEM from keys/prepare.');
    }
    const body = new URLSearchParams();
    body.set('api_key', input.apiKey);
    body.set('sign_token', signToken);
    for (const [key, value] of Object.entries(cleaned)) {
      body.set(key, typeof value === 'string' || typeof value === 'number' ? String(value) : JSON.stringify(value));
    }
    let response: Response;
    try {
      response = await fetchImpl(`${base}/${path.replace(/^\//, '')}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
          'user-agent': 'GGCard-Pay2/1.0',
        },
        body,
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new HttpError(502, 'pay2_unreachable', 'Could not reach Pay2.House.');
    }
    const text = await response.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      json = {};
    }
    if (!response.ok || json.status !== 'success') {
      throw new HttpError(
        502,
        String(json.code || 'pay2_error'),
        String(json.msg || json.message || 'Pay2.House rejected the request.'),
      );
    }
    return json;
  }

  return {
    mode: 'pay2',
    async probe() {
      const json = await post('wallets', { delete_flag: 0, currency_code: 'USD' });
      const wallets = Array.isArray(json.wallets) ? json.wallets : [];
      return {
        wallets: wallets.map((row) => {
          const item = asRecord(row);
          return {
            accountNumber: String(item.account_number ?? ''),
            name: String(item.name ?? ''),
            balance: Number(item.balance ?? 0),
            currencyCode: String(item.currency_code ?? 'USD'),
            trc20Address: String(item.trc20_address ?? ''),
          };
        }),
      };
    },
    async listBins(filter) {
      const json = await post('cards/bins', {
        currency_code: filter.currencyCode || 'USD',
        country_code: filter.countryCode || '',
        card_type: 'virtual',
        card_network: filter.cardNetwork || 'mastercard',
        card_product_type: filter.cardProductType || 'standard',
      });
      const bins = Array.isArray(json.bins) ? json.bins : [];
      return bins.map((row) => {
        const item = asRecord(row);
        return {
          bin: String(item.bin ?? ''),
          currencyCode: String(item.currency_code ?? ''),
          countryCode: String(item.country_code ?? ''),
          cardType: String(item.card_type ?? ''),
          cardNetwork: String(item.card_network ?? ''),
          cardProductType: String(item.card_product_type ?? ''),
          verificationRequired: Number(item.verification_required ?? 0),
        };
      });
    },
    async issueCard(card) {
      const json = await post('cards/issue', {
        account_number: card.accountNumber,
        first_name: card.firstName,
        last_name: card.lastName,
        sur_name: card.surName,
        date_birth: card.dateBirth,
        phone_number: card.phoneNumber,
        address: card.address,
        city: card.city,
        region: card.region,
        post_code: card.postCode,
        email: card.email,
        country_code: card.countryCode,
        bin_number: card.binNumber,
        renewal_payment_flag: 1,
      });
      const cardId = String(json.card_id ?? '');
      const cardNumber = String(json.card_number ?? '').replace(/\s+/g, '');
      if (!cardId || !cardNumber) {
        throw new HttpError(502, 'pay2_error', 'Pay2.House did not return a card number.');
      }
      return { cardId, cardNumber };
    },
    async cardDetails(cardId) {
      const json = await post('cards/details', { card_id: cardId });
      return {
        cardId: String(json.card_id ?? cardId),
        cardNumber: String(json.card_number ?? '').replace(/\s+/g, ''),
        cvv: String(json.cvv ?? ''),
        expirationDate: String(json.expiration_date ?? ''),
        password: String(json.password ?? ''),
        balance: Number(json.balance ?? 0),
        cardStatus: String(json.card_status ?? ''),
        currencyCode: String(json.currency_code ?? 'USD'),
        firstName: String(json.first_name ?? ''),
        lastName: String(json.last_name ?? ''),
      };
    },
    async topUp(cardId, accountNumber, amount) {
      const json = await post('cards/top_up', {
        card_id: cardId,
        account_number: accountNumber,
        amount,
      });
      return { transactionNumber: String(json.transaction_number ?? '') };
    },
  };
}

export function parseExpiry(expirationDate: string): { month: number; year: number } {
  const compact = expirationDate.replace(/\s+/g, '');
  let match = /^(\d{2})\/(\d{2}|\d{4})$/.exec(compact);
  if (match) {
    const month = Number(match[1]);
    let year = Number(match[2]);
    if (year < 100) year += 2000;
    return { month, year };
  }
  match = /^(\d{4})-(\d{2})/.exec(compact);
  if (match) return { year: Number(match[1]), month: Number(match[2]) };
  match = /^(\d{2})(\d{2})$/.exec(compact);
  if (match) return { month: Number(match[1]), year: 2000 + Number(match[2]) };
  return { month: 0, year: 0 };
}
