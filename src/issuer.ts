import { HttpError } from './errors.ts';

export type CardholderDraft = {
  name: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
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
};

export type CreateCardDraft = {
  cardholderId: string;
  type: 'virtual' | 'physical';
  currency: string;
  status: 'active' | 'inactive';
  spendingLimitCents: number;
  shipping?: {
    name: string;
    line1: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
};

export type IssuedCard = {
  id: string;
  last4: string;
  expMonth: number;
  expYear: number;
  brand: string;
  status: string;
};

export type CardIssuer = {
  mode: 'stripe';
  createCardholder(draft: CardholderDraft): Promise<{ id: string }>;
  createCard(draft: CreateCardDraft): Promise<IssuedCard>;
  updateCard(cardId: string, input: { status: 'active' | 'inactive'; spendingLimitCents: number }): Promise<void>;
  createEphemeralKey(input: { cardId: string; apiVersion: string; nonce?: string }): Promise<Record<string, unknown>>;
};

export const LIVE_KEY_MESSAGE =
  'Connect a live Stripe secret key (sk_live_...). That is the key that issues a card you can spend and add to Apple Pay, Google Pay, and Samsung Pay.';

export function createUnavailableIssuer(): CardIssuer {
  const refuse = async () => {
    throw new HttpError(400, 'live_key_required', LIVE_KEY_MESSAGE);
  };
  return {
    mode: 'stripe',
    createCardholder: refuse,
    createCard: refuse,
    updateCard: refuse,
    createEphemeralKey: refuse,
  };
}

type StripeErrorBody = { error?: { message?: string; code?: string } };

async function stripeForm(
  fetchImpl: typeof fetch,
  secretKey: string,
  method: string,
  path: string,
  params: URLSearchParams,
  apiVersion?: string,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (apiVersion) headers['Stripe-Version'] = apiVersion;
  const response = await fetchImpl(`https://api.stripe.com${path}`, {
    method,
    headers,
    body: params.toString(),
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let json: StripeErrorBody & Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as typeof json) : {};
  } catch {
    json = {};
  }
  if (!response.ok) {
    throw new HttpError(502, json.error?.code || 'stripe_error', json.error?.message || 'Stripe Issuing request failed.');
  }
  return json;
}

export function createStripeIssuer(input: {
  secretKey: string;
  apiVersion: string;
  fetchImpl?: typeof fetch;
}): CardIssuer {
  const fetchImpl = input.fetchImpl ?? fetch;
  return {
    mode: 'stripe',
    async createCardholder(draft) {
      const params = new URLSearchParams();
      params.set('type', 'individual');
      params.set('name', draft.name);
      params.set('email', draft.email);
      params.set('phone_number', draft.phone);
      params.set('status', 'active');
      params.set('billing[address][line1]', draft.line1);
      params.set('billing[address][city]', draft.city);
      params.set('billing[address][state]', draft.state);
      params.set('billing[address][postal_code]', draft.postalCode);
      params.set('billing[address][country]', draft.country);
      params.set('individual[first_name]', draft.firstName);
      params.set('individual[last_name]', draft.lastName);
      params.set('individual[dob][day]', String(draft.dobDay));
      params.set('individual[dob][month]', String(draft.dobMonth));
      params.set('individual[dob][year]', String(draft.dobYear));
      params.set(
        'individual[card_issuing][user_terms_acceptance][date]',
        String(Math.floor(draft.termsAcceptedAt / 1000)),
      );
      params.set('individual[card_issuing][user_terms_acceptance][ip]', draft.termsIp);
      const json = await stripeForm(
        fetchImpl,
        input.secretKey,
        'POST',
        '/v1/issuing/cardholders',
        params,
        input.apiVersion,
      );
      return { id: String(json.id) };
    },
    async createCard(draft) {
      const params = new URLSearchParams();
      params.set('cardholder', draft.cardholderId);
      params.set('currency', draft.currency);
      params.set('type', draft.type);
      params.set('status', draft.status);
      params.set('spending_controls[spending_limits][0][amount]', String(Math.max(draft.spendingLimitCents, 1)));
      params.set('spending_controls[spending_limits][0][interval]', 'all_time');
      if (draft.shipping) {
        params.set('shipping[name]', draft.shipping.name);
        params.set('shipping[address][line1]', draft.shipping.line1);
        params.set('shipping[address][city]', draft.shipping.city);
        params.set('shipping[address][state]', draft.shipping.state);
        params.set('shipping[address][postal_code]', draft.shipping.postalCode);
        params.set('shipping[address][country]', draft.shipping.country);
        params.set('shipping[service]', 'standard');
      }
      const json = await stripeForm(fetchImpl, input.secretKey, 'POST', '/v1/issuing/cards', params, input.apiVersion);
      return {
        id: String(json.id),
        last4: String(json.last4 ?? ''),
        expMonth: Number(json.exp_month),
        expYear: Number(json.exp_year),
        brand: String(json.brand ?? 'visa'),
        status: String(json.status ?? draft.status),
      };
    },
    async updateCard(cardId, update) {
      const params = new URLSearchParams();
      params.set('status', update.status);
      params.set('spending_controls[spending_limits][0][amount]', String(Math.max(update.spendingLimitCents, 1)));
      params.set('spending_controls[spending_limits][0][interval]', 'all_time');
      await stripeForm(
        fetchImpl,
        input.secretKey,
        'POST',
        `/v1/issuing/cards/${cardId}`,
        params,
        input.apiVersion,
      );
    },
    async createEphemeralKey(keyInput) {
      const params = new URLSearchParams();
      params.set('issuing_card', keyInput.cardId);
      if (keyInput.nonce) params.set('nonce', keyInput.nonce);
      const json = await stripeForm(
        fetchImpl,
        input.secretKey,
        'POST',
        '/v1/ephemeral_keys',
        params,
        keyInput.apiVersion,
      );
      return { ...json, api_version: keyInput.apiVersion, ephemeralKeySecret: json.secret };
    },
  };
}
