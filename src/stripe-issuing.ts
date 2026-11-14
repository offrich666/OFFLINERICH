import { HttpError } from './errors.ts';

const STRIPE_API = 'https://api.stripe.com/v1';

export type StripeIssuedCard = {
  cardId: string;
  cardholderId: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  currency: string;
  status: string;
  pan?: string;
  cvv?: string;
};

export type StripeIssuingClient = {
  mode: 'stripe';
  ready: boolean;
  probe(): Promise<{ issuingAvailableCents: number; currency: string }>;
  issueVirtualCard(input: {
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
    currency?: string;
  }): Promise<StripeIssuedCard>;
  cardSecrets(cardId: string): Promise<{ pan: string; cvv: string; expMonth: number; expYear: number; brand: string; last4: string }>;
};

function formBody(data: Record<string, string | number | undefined>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || value === '') continue;
    body.set(key, String(value));
  }
  return body;
}

export function createStripeIssuingClient(input: {
  secretKey: string;
  fetchImpl?: typeof fetch;
}): StripeIssuingClient {
  const fetchImpl = input.fetchImpl ?? fetch;
  const secretKey = input.secretKey.trim();

  async function stripe(
    method: 'GET' | 'POST',
    path: string,
    data?: Record<string, string | number | undefined>,
  ): Promise<Record<string, unknown>> {
    const url = path.startsWith('http') ? path : `${STRIPE_API}${path.startsWith('/') ? path : `/${path}`}`;
    const init: RequestInit = {
      method,
      headers: {
        authorization: `Bearer ${secretKey}`,
        accept: 'application/json',
        'user-agent': 'GCardsEU-StripeIssuing/1.0',
      },
      signal: AbortSignal.timeout(30000),
    };
    if (method === 'POST') {
      init.headers = {
        ...init.headers,
        'content-type': 'application/x-www-form-urlencoded',
      };
      init.body = formBody(data || {});
    }
    let response: Response;
    try {
      response = await fetchImpl(url, init);
    } catch {
      throw new HttpError(502, 'stripe_unreachable', 'Could not reach Stripe Issuing.');
    }
    const text = await response.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      json = {};
    }
    if (!response.ok) {
      const err = (json.error || {}) as { message?: string; code?: string };
      throw new HttpError(
        response.status === 401 || response.status === 403 ? 403 : 502,
        err.code || 'stripe_error',
        err.message || 'Stripe Issuing rejected the request. Activate Issuing in the Stripe Dashboard and accept card issuing terms.',
      );
    }
    return json;
  }

  return {
    mode: 'stripe',
    ready: Boolean(secretKey),
    async probe() {
      const balance = await stripe('GET', '/balance');
      const issuing = (balance.issuing || {}) as { available?: Array<{ amount?: number; currency?: string }> };
      const row = issuing.available?.[0] || { amount: 0, currency: 'eur' };
      return {
        issuingAvailableCents: Number(row.amount || 0),
        currency: String(row.currency || 'eur'),
      };
    },
    async issueVirtualCard(card) {
      const currency = (card.currency || 'eur').toLowerCase();
      const cardholder = await stripe('POST', '/issuing/cardholders', {
        name: card.name,
        email: card.email,
        phone_number: card.phone.startsWith('+') ? card.phone : `+${card.phone}`,
        status: 'active',
        type: 'individual',
        'individual[first_name]': card.firstName,
        'individual[last_name]': card.lastName,
        'individual[dob][day]': card.dobDay,
        'individual[dob][month]': card.dobMonth,
        'individual[dob][year]': card.dobYear,
        'billing[address][line1]': card.line1,
        'billing[address][city]': card.city,
        'billing[address][state]': card.state,
        'billing[address][postal_code]': card.postalCode,
        'billing[address][country]': card.country,
      });
      const cardholderId = String(cardholder.id || '');
      if (!cardholderId) {
        throw new HttpError(502, 'stripe_error', 'Stripe did not return a cardholder id.');
      }
      const issued = await stripe('POST', '/issuing/cards', {
        cardholder: cardholderId,
        currency,
        type: 'virtual',
        status: 'active',
      });
      const cardId = String(issued.id || '');
      if (!cardId) {
        throw new HttpError(502, 'stripe_error', 'Stripe did not return a card id.');
      }
      let secrets: Awaited<ReturnType<StripeIssuingClient['cardSecrets']>> | null = null;
      try {
        secrets = await this.cardSecrets(cardId);
      } catch {
        secrets = null;
      }
      return {
        cardId,
        cardholderId,
        brand: String(issued.brand || secrets?.brand || 'mastercard').toLowerCase(),
        last4: String(issued.last4 || secrets?.last4 || '0000'),
        expMonth: Number(issued.exp_month || secrets?.expMonth || 0),
        expYear: Number(issued.exp_year || secrets?.expYear || 0),
        currency,
        status: String(issued.status || 'active'),
        pan: secrets?.pan,
        cvv: secrets?.cvv,
      };
    },
    async cardSecrets(cardId) {
      const json = await stripe(
        'GET',
        `/issuing/cards/${encodeURIComponent(cardId)}?expand[]=number&expand[]=cvc`,
      );
      const pan = String(json.number || '').replace(/\D/g, '');
      const cvv = String(json.cvc || '');
      if (!pan || !cvv) {
        throw new HttpError(
          502,
          'stripe_pan_unavailable',
          'Stripe card exists but PAN/CVC were not returned. Retrieve them in the Stripe Dashboard or Issuing Elements.',
        );
      }
      return {
        pan,
        cvv,
        expMonth: Number(json.exp_month || 0),
        expYear: Number(json.exp_year || 0),
        brand: String(json.brand || 'mastercard').toLowerCase(),
        last4: String(json.last4 || pan.slice(-4)),
      };
    },
  };
}
