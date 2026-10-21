import { HttpError } from './errors.ts';

export const LIVE_KEY_MESSAGE =
  'Connect live Immersve card keys (imm-key-… and imm-secret-…, without -test-). Immersve issues the Mastercard you can spend, and Apple Pay is added from the iPhone app.';

export const IMMERSVE_LIVE_BASE = 'https://api.immersve.com';

export type ImmersveCard = {
  id: string;
  last4: string;
  expMonth: number;
  expYear: number;
  brand: string;
  status: string;
  seriesId: string;
  cardholderName: string;
};

export type SpendingPrerequisite = {
  stage?: string;
  status?: string;
  type?: string;
  actionType?: string;
  params?: {
    kycUrl?: string;
    contractAddress?: string;
    status?: string;
    abi?: unknown;
    method?: string;
    params?: Record<string, unknown>;
    to?: string;
  };
};

export type ImmersveIssuer = {
  mode: 'immersve';
  probePartner(): Promise<void>;
  loginInit(input: { address: string }): Promise<{ loginRequestId: string; message: string }>;
  loginComplete(input: { loginRequestId: string; signature: string }): Promise<{
    accessToken: string;
    refreshToken: string;
    cardholderAccountId: string;
  }>;
  refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }>;
  updateContact(accessToken: string, accountId: string, email: string, phone: string): Promise<void>;
  createFundingSource(accessToken: string, accountId: string, fundingAddress: string): Promise<{ id: string }>;
  spendingPrerequisites(accessToken: string, fundingSourceId: string, spendableAmount: number): Promise<SpendingPrerequisite[]>;
  createCard(accessToken: string, fundingSourceId: string): Promise<{ cardId: string }>;
  getCard(accessToken: string, cardId: string): Promise<ImmersveCard>;
  panToken(accessToken: string, cardId: string): Promise<{ callbackUrl: string }>;
  provisionApplePay(
    accessToken: string,
    cardId: string,
    input: { certChain: string[]; nonce: string; nonceSignature: string },
  ): Promise<{ encryptedPassData: string; ephemeralPublicKey: string; activationData: string }>;
  fundingBalanceCents(accessToken: string, accountId: string, fundingSourceId: string): Promise<number | null>;
};

type ErrorBody = { message?: string; errorCode?: string; statusName?: string };

export function isLiveImmersveKey(apiKey: string, apiSecret: string): boolean {
  if (!apiKey.startsWith('imm-key-') || !apiSecret.startsWith('imm-secret-')) return false;
  if (apiKey.includes('-test-') || apiSecret.includes('-test-')) return false;
  return true;
}

export function isTestImmersveKey(apiKey: string, apiSecret: string): boolean {
  return apiKey.includes('-test-') || apiSecret.includes('-test-');
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

export function createUnavailableIssuer(): ImmersveIssuer {
  const refuse = async () => {
    throw new HttpError(400, 'live_key_required', LIVE_KEY_MESSAGE);
  };
  return {
    mode: 'immersve',
    probePartner: refuse,
    loginInit: refuse,
    loginComplete: refuse,
    refresh: refuse,
    updateContact: refuse,
    createFundingSource: refuse,
    spendingPrerequisites: refuse,
    createCard: refuse,
    getCard: refuse,
    panToken: refuse,
    provisionApplePay: refuse,
    fundingBalanceCents: refuse,
  };
}

async function immersve(
  fetchImpl: typeof fetch,
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: { accept: 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new HttpError(502, 'issuer_unreachable', 'Could not reach Immersve.');
  }
  const text = await response.text();
  let json: ErrorBody & Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as typeof json) : {};
  } catch {
    json = {};
  }
  if (!response.ok) {
    throw new HttpError(
      response.status === 401 || response.status === 403 ? 502 : 502,
      json.errorCode || 'issuer_error',
      json.message || json.statusName || 'Immersve rejected the request.',
    );
  }
  return json;
}

function expiryParts(card: Record<string, unknown>): { month: number; year: number } {
  const compact = String(card.expiry ?? '');
  const match = /^(\d{4})(\d{2})$/.exec(compact);
  if (match) return { year: Number(match[1]), month: Number(match[2]) };
  const expires = String(card.expiresAt ?? '');
  const date = new Date(expires);
  if (!Number.isNaN(date.getTime())) return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
  return { year: 0, month: 0 };
}

export function centsFromFundingBalance(balance: string, currency: string): number | null {
  if (!/^-?\d+$/.test(balance)) return null;
  const raw = Number(balance);
  if (!Number.isFinite(raw)) return null;
  const code = currency.toUpperCase();
  if (code === 'USD') return Math.round(raw);
  return Math.round(raw / 10_000);
}

export function createImmersveIssuer(input: {
  apiKey: string;
  apiSecret: string;
  clientApplicationId: string;
  partnerAccountId: string;
  cardProgramId: string;
  fundingChannelId: string;
  clientOrigin: string;
  network: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}): ImmersveIssuer {
  const fetchImpl = input.fetchImpl ?? fetch;
  const base = (input.baseUrl || IMMERSVE_LIVE_BASE).replace(/\/$/, '');
  const partnerHeaders = {
    'content-type': 'application/json',
    'x-api-key': input.apiKey,
    'x-api-secret': input.apiSecret,
    'x-account-id': input.partnerAccountId,
    origin: input.clientOrigin,
  };
  const userHeaders = (accessToken: string) => ({
    'content-type': 'application/json',
    authorization: `Bearer ${accessToken}`,
    origin: input.clientOrigin,
  });

  return {
    mode: 'immersve',
    async probePartner() {
      if (!isLiveImmersveKey(input.apiKey, input.apiSecret)) throw liveKeyError(input.apiKey, input.apiSecret);
      await immersve(fetchImpl, 'GET', `${base}/api/partner-profiles/${input.partnerAccountId}`, partnerHeaders);
    },
    async loginInit(login) {
      const json = await immersve(fetchImpl, 'POST', `${base}/auth/login-init`, partnerHeaders, {
        loginMethod: 'siwe',
        network: input.network,
        clientApplicationId: input.clientApplicationId,
        scopes: ['cardholder-partner'],
        address: login.address,
        autoSignup: true,
        url: input.clientOrigin,
      });
      const loginRequestId = String(json.loginRequestId ?? '');
      const message = String(json.message ?? json.signingChallenge ?? '');
      if (!loginRequestId || !message) {
        throw new HttpError(502, 'issuer_error', 'Immersve did not return a wallet login challenge.');
      }
      return { loginRequestId, message };
    },
    async loginComplete(login) {
      const json = await immersve(fetchImpl, 'POST', `${base}/auth/login-complete`, partnerHeaders, {
        loginRequestId: login.loginRequestId,
        signature: login.signature,
      });
      const accessToken = String(json.accessToken ?? '');
      const refreshToken = String(json.refreshToken ?? '');
      const cardholderAccountId = String(json.cardholderAccountId ?? '');
      if (!accessToken || !refreshToken || !cardholderAccountId) {
        throw new HttpError(502, 'issuer_error', 'Immersve did not finish the wallet login.');
      }
      return { accessToken, refreshToken, cardholderAccountId };
    },
    async refresh(refreshToken) {
      const json = await immersve(fetchImpl, 'POST', `${base}/auth/token`, partnerHeaders, {
        refreshToken,
        clientApplicationId: input.clientApplicationId,
      });
      const accessToken = String(json.accessToken ?? '');
      const nextRefresh = String(json.refreshToken ?? refreshToken);
      if (!accessToken) throw new HttpError(502, 'issuer_error', 'Immersve did not refresh the card session.');
      return { accessToken, refreshToken: nextRefresh };
    },
    async updateContact(accessToken, accountId, email, phone) {
      await immersve(fetchImpl, 'PATCH', `${base}/api/accounts/${accountId}/contact-details`, userHeaders(accessToken), {
        email: { emailAddress: email },
        phone: { phoneNumber: phone },
      });
    },
    async createFundingSource(accessToken, accountId, fundingAddress) {
      const json = await immersve(fetchImpl, 'POST', `${base}/api/funding-sources`, userHeaders(accessToken), {
        accountId,
        fundingChannelId: input.fundingChannelId,
        fundingAddress,
      });
      const id = String(json.id ?? '');
      if (!id) throw new HttpError(502, 'issuer_error', 'Immersve did not create a funding source for this wallet.');
      return { id };
    },
    async spendingPrerequisites(accessToken, fundingSourceId, spendableAmount) {
      const json = await immersve(fetchImpl, 'POST', `${base}/api/spending-prerequisites`, userHeaders(accessToken), {
        cardProgramId: input.cardProgramId,
        fundingSourceId,
        spendableAmount,
        spendableCurrency: 'USD',
        kycType: 'immersve-conducted',
        kycRedirectUrl: input.clientOrigin,
      });
      const list = json.prerequisites;
      return Array.isArray(list) ? (list as SpendingPrerequisite[]) : [];
    },
    async createCard(accessToken, fundingSourceId) {
      const json = await immersve(fetchImpl, 'POST', `${base}/api/cards`, userHeaders(accessToken), {
        cardProgramId: input.cardProgramId,
        fundingSourceId,
      });
      const cardId = String(json.cardId ?? '');
      if (!cardId) throw new HttpError(502, 'issuer_error', 'Immersve did not return a card id.');
      return { cardId };
    },
    async getCard(accessToken, cardId) {
      const json = await immersve(fetchImpl, 'GET', `${base}/api/cards/${cardId}`, userHeaders(accessToken));
      const expiry = expiryParts(json);
      return {
        id: cardId,
        last4: String(json.panLast4 ?? ''),
        expMonth: expiry.month,
        expYear: expiry.year,
        brand: String(json.network ?? 'mastercard'),
        status: String(json.status ?? 'active'),
        seriesId: String(json.seriesId ?? ''),
        cardholderName: String(json.cardholderName ?? ''),
      };
    },
    async panToken(accessToken, cardId) {
      const json = await immersve(fetchImpl, 'POST', `${base}/api/cards/${cardId}/pan-token`, userHeaders(accessToken));
      const callbackUrl = String(json.callbackUrl ?? '');
      if (!callbackUrl.startsWith('https://')) {
        throw new HttpError(502, 'issuer_error', 'Immersve did not return a secure card link.');
      }
      return { callbackUrl };
    },
    async provisionApplePay(accessToken, cardId, apple) {
      const json = await immersve(
        fetchImpl,
        'POST',
        `${base}/api/cards/${cardId}/provision/apple-pay`,
        userHeaders(accessToken),
        { certChain: apple.certChain, nonce: apple.nonce, nonceSignature: apple.nonceSignature },
      );
      return {
        encryptedPassData: String(json.encryptedPassData ?? ''),
        ephemeralPublicKey: String(json.ephemeralPublicKey ?? ''),
        activationData: String(json.activationData ?? ''),
      };
    },
    async fundingBalanceCents(accessToken, accountId, fundingSourceId) {
      const json = await immersve(
        fetchImpl,
        'GET',
        `${base}/api/accounts/${accountId}/funding-sources`,
        userHeaders(accessToken),
      );
      const rows = Array.isArray(json.items) ? json.items : Array.isArray(json.fundingSources) ? json.fundingSources : [];
      const match = (rows as Array<Record<string, unknown>>).find((row) => String(row.id ?? '') === fundingSourceId) ??
        (rows as Array<Record<string, unknown>>)[0];
      if (!match) return null;
      return centsFromFundingBalance(String(match.balance ?? ''), String(match.balanceCurrency ?? 'USDC'));
    },
  };
}

export function kycUrlFrom(prerequisites: SpendingPrerequisite[]): string {
  for (const item of prerequisites) {
    const url = item.params?.kycUrl;
    if (item.status === 'action-required' && url) return url;
  }
  return '';
}

export function contractAddressFrom(prerequisites: SpendingPrerequisite[]): string {
  for (const item of prerequisites) {
    const candidates = [item.params?.contractAddress, item.params?.to];
    for (const address of candidates) {
      if (address && /^0x[0-9a-fA-F]{40}$/.test(address)) return address.toLowerCase();
    }
  }
  return '';
}
