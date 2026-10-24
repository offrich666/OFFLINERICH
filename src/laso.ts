import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { HttpError } from './errors.ts';

const LASO_BASE = 'https://laso.finance';

export type LasoCredentials = {
  userId: string;
  refreshToken: string;
  idToken?: string;
  idTokenExpiresAt?: number;
};

export type LasoWallet = {
  userId: string;
  hasWallet: boolean;
  walletAddress: string;
  baseWalletAddress: string;
  balanceUsdc: number;
  needsFunding: boolean;
};

export type LasoIssuedCard = {
  cardId: string;
  usdAmount: number;
  status: string;
  last4: string;
  brand: string;
  expMonth: number;
  expYear: number;
  pan?: string;
  cvv?: string;
  txHash?: string;
  cardDetails: Record<string, unknown> | null;
};

type AgentPayResult = {
  status: number;
  body: unknown;
  txHash?: string;
  error?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

export function loadLasoCredentials(env: Record<string, string | undefined>, credentialsPath?: string): LasoCredentials | null {
  const userId = env.LASO_USER_ID?.trim() ?? '';
  const refreshToken = env.LASO_REFRESH_TOKEN?.trim() ?? '';
  if (userId && refreshToken) {
    return { userId, refreshToken, idToken: env.LASO_ID_TOKEN?.trim() || undefined };
  }
  const filePath = credentialsPath
    || env.LASO_CREDENTIALS_PATH?.trim()
    || path.join(process.cwd(), 'data', 'laso-credentials.json');
  if (!existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
    const id = String(raw.user_id || raw.userId || '').trim();
    const refresh = String(raw.refresh_token || raw.refreshToken || '').trim();
    if (!id || !refresh) return null;
    return {
      userId: id,
      refreshToken: refresh,
      idToken: String(raw.id_token || raw.idToken || '').trim() || undefined,
    };
  } catch {
    return null;
  }
}

export function saveLasoCredentials(creds: LasoCredentials, credentialsPath?: string): void {
  const filePath = credentialsPath || path.join(process.cwd(), 'data', 'laso-credentials.json');
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    `${JSON.stringify({
      user_id: creds.userId,
      refresh_token: creds.refreshToken,
      id_token: creds.idToken || null,
      updated_at: new Date().toISOString(),
    }, null, 2)}\n`,
    { mode: 0o600 },
  );
}

export class LasoClient {
  private creds: LasoCredentials;
  private credentialsPath?: string;

  constructor(creds: LasoCredentials, credentialsPath?: string) {
    this.creds = { ...creds };
    this.credentialsPath = credentialsPath;
  }

  get userId(): string {
    return this.creds.userId;
  }

  get ready(): boolean {
    return Boolean(this.creds.userId && this.creds.refreshToken);
  }

  private async ensureIdToken(): Promise<string> {
    if (this.creds.idToken) {
      // Best-effort: try once; refresh on 401.
      return this.creds.idToken;
    }
    return this.refreshIdToken();
  }

  async refreshIdToken(): Promise<string> {
    const res = await fetch(`${LASO_BASE}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: this.creds.refreshToken,
      }),
    });
    const body = (await readJson(res)) as {
      auth?: { id_token?: string; refresh_token?: string; expires_in?: string };
      id_token?: string;
      refresh_token?: string;
    };
    if (!res.ok) {
      throw new HttpError(502, 'laso_auth_failed', 'Could not refresh Laso credentials. Re-link the Laso agent account.');
    }
    const auth = body.auth || body;
    const idToken = auth.id_token || body.id_token;
    const refresh = auth.refresh_token || body.refresh_token;
    if (!idToken) {
      throw new HttpError(502, 'laso_auth_failed', 'Laso refresh did not return an id token.');
    }
    this.creds.idToken = idToken;
    if (refresh) this.creds.refreshToken = refresh;
    try {
      saveLasoCredentials(this.creds, this.credentialsPath);
    } catch {
      // ignore disk errors — in-memory token still works
    }
    return idToken;
  }

  private async authedGet(pathname: string): Promise<{ status: number; body: unknown }> {
    let token = await this.ensureIdToken();
    let res = await fetch(`${LASO_BASE}${pathname}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (res.status === 401) {
      token = await this.refreshIdToken();
      res = await fetch(`${LASO_BASE}${pathname}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
    }
    return { status: res.status, body: await readJson(res) };
  }

  private async agentPay(route: string, params: Record<string, string | number>): Promise<AgentPayResult> {
    let token = await this.ensureIdToken();
    const payload = {
      data: {
        userId: this.creds.userId,
        route,
        params,
        method: 'GET',
      },
    };
    const post = async (bearer: string) => {
      const res = await fetch(`${LASO_BASE}/agentX402Pay`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearer}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });
      return { status: res.status, body: await readJson(res) };
    };
    let { status, body } = await post(token);
    if (status === 401) {
      token = await this.refreshIdToken();
      ({ status, body } = await post(token));
    }
    if (status >= 400) {
      const err = body as { message?: string; error?: string; code?: string };
      throw new HttpError(
        status === 402 ? 402 : 502,
        err.code || 'laso_pay_failed',
        err.message || err.error || 'Laso payment call failed.',
      );
    }
    const wrapped = body as { result?: AgentPayResult };
    const result = wrapped.result || (body as AgentPayResult);
    if (!result || typeof result.status !== 'number') {
      throw new HttpError(502, 'laso_pay_failed', 'Unexpected Laso agentX402Pay response.');
    }
    return result;
  }

  async wallet(): Promise<LasoWallet> {
    const { status, body } = await this.authedGet('/getAgentWallet');
    if (status >= 400) {
      const err = body as { message?: string; error?: string };
      throw new HttpError(502, 'laso_wallet_failed', err.message || err.error || 'Could not read Laso wallet.');
    }
    const w = body as Record<string, unknown>;
    return {
      userId: String(w.user_id || this.creds.userId),
      hasWallet: Boolean(w.has_wallet),
      walletAddress: String(w.wallet_address || ''),
      baseWalletAddress: String(w.base_wallet_address || ''),
      balanceUsdc: Number(w.balance_usdc || 0),
      needsFunding: Boolean(w.needs_funding),
    };
  }

  async getCardData(cardId: string): Promise<Record<string, unknown>> {
    const { status, body } = await this.authedGet(`/get-card-data?card_id=${encodeURIComponent(cardId)}`);
    if (status >= 400) {
      const err = body as { message?: string; error?: string };
      throw new HttpError(502, 'laso_card_data_failed', err.message || err.error || 'Could not read Laso card data.');
    }
    return body as Record<string, unknown>;
  }

  async issueUsaPrepaid(amountUsd: number): Promise<LasoIssuedCard> {
    const amount = Math.round(amountUsd);
    if (amount < 5 || amount > 1000) {
      throw new HttpError(400, 'invalid_amount', 'Laso USA prepaid amount must be $5–$1000.');
    }
    const wallet = await this.wallet();
    if (wallet.balanceUsdc + 1e-9 < amount) {
      throw new HttpError(
        402,
        'laso_insufficient_funds',
        `Laso wallet holds $${wallet.balanceUsdc.toFixed(2)} USDC; need at least $${amount}. Send USDC to ${wallet.walletAddress} (Solana) or ${wallet.baseWalletAddress} (Base).`,
      );
    }

    const paid = await this.agentPay('get-card', { amount, format: 'json' });
    if (paid.status === 402) {
      const body = paid.body as { errorMessage?: string; errorReason?: string };
      throw new HttpError(
        402,
        body.errorReason || 'laso_insufficient_funds',
        body.errorMessage || paid.error || 'Laso wallet cannot cover this card.',
      );
    }
    if (paid.status < 200 || paid.status >= 300) {
      throw new HttpError(502, 'laso_issue_failed', paid.error || `Laso get-card returned ${paid.status}.`);
    }

    const body = paid.body as {
      card?: { card_id?: string; usd_amount?: number; status?: string };
      auth?: { id_token?: string; refresh_token?: string };
    };
    if (body.auth?.id_token) {
      this.creds.idToken = body.auth.id_token;
      if (body.auth.refresh_token) this.creds.refreshToken = body.auth.refresh_token;
      try {
        saveLasoCredentials(this.creds, this.credentialsPath);
      } catch {
        // ignore
      }
    }
    const cardId = body.card?.card_id;
    if (!cardId) {
      throw new HttpError(502, 'laso_issue_failed', 'Laso did not return a card_id.');
    }

    let details: Record<string, unknown> | null = null;
    for (let i = 0; i < 40; i += 1) {
      await sleep(2500);
      const data = await this.getCardData(cardId);
      const status = String(data.status || '');
      if (status === 'ready' || data.card_details) {
        details = data;
        break;
      }
      if (status === 'failed' || status === 'cancelled') {
        throw new HttpError(502, 'laso_issue_failed', `Laso card ended as ${status}.`);
      }
    }
    if (!details) {
      throw new HttpError(504, 'laso_card_pending', `Card ${cardId} is still pending. Poll GET /api/admin/laso/cards/${cardId}.`);
    }

    const cardDetails = (details.card_details || null) as Record<string, unknown> | null;
    const pan = String(cardDetails?.card_number || cardDetails?.number || cardDetails?.pan || '').replace(/\D/g, '');
    const last4 = String(details.last4 || pan.slice(-4) || '0000').slice(-4);
    const expRaw = String(cardDetails?.expiration_date || cardDetails?.expiry || cardDetails?.exp || '');
    let expMonth = Number(cardDetails?.exp_month || cardDetails?.expMonth || 0);
    let expYear = Number(cardDetails?.exp_year || cardDetails?.expYear || 0);
    const expMatch = /^(\d{1,2})\D+(\d{2,4})$/.exec(expRaw.trim());
    if (expMatch) {
      expMonth = Number(expMatch[1]);
      expYear = Number(expMatch[2]);
      if (expYear < 100) expYear += 2000;
    }
    const cvv = String(cardDetails?.cvv || cardDetails?.cvc || cardDetails?.security_code || '') || undefined;

    return {
      cardId,
      usdAmount: Number(body.card?.usd_amount || amount),
      status: String(details.status || 'ready'),
      last4,
      brand: String(details.brand || cardDetails?.brand || 'visa').toLowerCase(),
      expMonth: expMonth || 12,
      expYear: expYear || new Date().getFullYear() + 3,
      pan: pan || undefined,
      cvv,
      txHash: paid.txHash,
      cardDetails,
    };
  }
}
