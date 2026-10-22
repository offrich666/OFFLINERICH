import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureAdmin } from './admin.ts';
import { chainById, CHAINS } from './chains.ts';
import { accessLinks, phoneAccessUrl } from './links.ts';
import { loadConfig, overlaySaved, readiness, type Config, type Env } from './config.ts';
import type { RpcClient } from './erc20.ts';
import { HttpError } from './errors.ts';
import { createImmersveIssuer, createUnavailableIssuer } from './issuer.ts';
import { createPay2Client } from './pay2.ts';
import { createPriceClient, type PriceClient } from './prices.ts';
import { qrSvg } from './qr.ts';
import * as service from './service.ts';
import { openStore, type Store } from './store.ts';

const cookieName = 'or_session';

export type CreateAppOptions = {
  env?: Env;
  dbPath?: string;
  rpc?: RpcClient;
  prices?: PriceClient;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

function createRpc(config: Config, fetchImpl: typeof fetch): RpcClient {
  return {
    async call(chainId, method, params) {
      const chain = chainById(chainId);
      if (!chain) throw new Error(`Unknown chain ${chainId}`);
      const response = await fetchImpl(config.rpcUrls[chainId] || chain.rpc, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
      const body = (await response.json()) as { result?: unknown; error?: { message?: string } };
      if (body.error) throw new Error(body.error.message || 'RPC error');
      return body.result ?? null;
    },
  };
}

function readCookie(header: string | undefined, name: string): string {
  if (!header) return '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

function sessionToken(req: Request): string {
  const header = req.header('authorization') ?? '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return readCookie(req.header('cookie'), cookieName);
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  console.error(error instanceof Error ? error.message : error);
  res.status(500).json({ error: { code: 'internal', message: 'Something went wrong.' } });
}

function asyncRoute(fn: (req: Request, res: Response) => Promise<void> | void) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

export function createApp(options: CreateAppOptions = {}) {
  const env = options.env ?? process.env;
  const config = loadConfig(env);
  const fetchImpl = options.fetchImpl ?? fetch;
  const store: Store = openStore(options.dbPath ?? config.databasePath);
  ensureAdmin(store, options.now ? options.now() : Date.now());
  overlaySaved(config, store.getSettings(), env);
  const ctx: service.Ctx = {
    config,
    store,
    rpc: options.rpc ?? createRpc(config, fetchImpl),
    prices: options.prices ?? createPriceClient(fetchImpl),
    fetchImpl,
    issuer: config.livemode
      ? createImmersveIssuer({
          apiKey: config.immersveApiKey,
          apiSecret: config.immersveApiSecret,
          clientApplicationId: config.immersveClientApplicationId,
          partnerAccountId: config.immersvePartnerAccountId,
          cardProgramId: config.immersveCardProgramId,
          fundingChannelId: config.immersveFundingChannelId,
          clientOrigin: config.immersveClientOrigin,
          network: config.immersveNetwork,
          fetchImpl,
        })
      : createUnavailableIssuer(),
    pay2: config.pay2Ready
      ? createPay2Client({
          apiKey: config.pay2ApiKey,
          keyId: config.pay2KeyId,
          privateKeyPem: config.pay2PrivateKeyPem,
          fetchImpl,
        })
      : null,
    now: options.now ?? (() => Date.now()),
  };
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy ? 1 : false);
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  app.use(express.json({ limit: '256kb' }));

  function setSession(res: Response, token: string): void {
    const secure = config.secureCookies ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${cookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`);
  }

  function sessionUser(req: Request): string {
    const token = sessionToken(req);
    const session = token ? store.getSession(token) : undefined;
    if (!session) throw new HttpError(401, 'auth_required', 'Sign in to continue.');
    return session.userId;
  }

  function actor(req: Request): string {
    const userId = sessionUser(req);
    const clientId = (req.header('x-client-id') ?? '').trim();
    if (!clientId) return userId;
    service.requireAdmin(ctx, userId);
    const client = store.getUser(clientId);
    if (!client || client.role === 'admin') throw new HttpError(404, 'client_not_found', 'That client is not on the desk.');
    return client.id;
  }

  function requireOperator(req: Request): void {
    const header = req.header('authorization') ?? '';
    const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
    if (!config.operatorToken || !service.tokensEqual(token, config.operatorToken)) {
      throw new HttpError(401, 'unauthorized', 'Operator token required.');
    }
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/config', (_req, res) => {
    const issuer = config.pay2Ready ? 'pay2' : config.livemode ? 'immersve' : 'unconfigured';
    res.json({
      issuer,
      livemode: config.livemode,
      pay2Ready: config.pay2Ready,
      pay2AccountNumber: config.pay2Ready ? config.pay2AccountNumber : '',
      pay2BinNumber: config.pay2Ready ? config.pay2BinNumber : '',
      currency: 'usd',
      feeBps: config.feeBps,
      treasuryAddress: config.treasuryAddress,
      network: config.immersveNetwork,
      blockedCountries: config.blockedCountries,
      wallets: {
        applePay: { manual: true, push: true },
        googlePay: { manual: true, push: false },
        samsungPay: { manual: true, push: Boolean(config.visaApiKey && config.visaSharedSecret) },
      },
      chains: CHAINS.map((chain) => ({ id: chain.id, name: chain.name })),
      readiness: readiness(config),
      product: 'GG Card',
      links: accessLinks(config.port, config.publicBaseUrl),
      publicBaseUrl: config.publicBaseUrl || null,
    });
  });

  app.get('/api/phone-access', asyncRoute(async (req, res) => {
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    const requestOrigin = host ? `${proto}://${host}` : '';
    const url = phoneAccessUrl(config.port, config.publicBaseUrl, requestOrigin);
    if (!url) {
      res.json({
        ok: false,
        url: null,
        qrSvg: null,
        hint: 'Set PUBLIC_BASE_URL to an HTTPS tunnel or domain. 127.0.0.1 does not open on iPhone.',
      });
      return;
    }
    res.json({
      ok: true,
      url,
      qrSvg: await qrSvg(url),
      hint: 'Scan this QR on iPhone Safari. Do not open 127.0.0.1 on the phone.',
    });
  }));

  app.post('/api/register', asyncRoute(async (req, res) => {
    if (!config.selfSignup) {
      throw new HttpError(403, 'signup_closed', 'Only the admin signs in. The admin creates client cards from the desk.');
    }
    const result = await service.register(ctx, req.body ?? {});
    setSession(res, result.token);
    res.status(201).json(result);
  }));

  app.post('/api/login', asyncRoute(async (req, res) => {
    const result = await service.login(ctx, req.body ?? {});
    setSession(res, result.token);
    res.json(result);
  }));

  app.post('/api/logout', asyncRoute((req, res) => {
    service.logout(ctx, sessionToken(req));
    res.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
    res.json({ ok: true });
  }));

  app.get('/api/me', asyncRoute((req, res) => {
    res.json(service.me(ctx, actor(req)));
  }));

  app.get('/api/tokens', asyncRoute(async (req, res) => {
    res.json(await service.listTokens(ctx, actor(req)));
  }));

  app.post('/api/tokens', asyncRoute(async (req, res) => {
    res.status(201).json(await service.addToken(ctx, actor(req), req.body ?? {}));
  }));

  app.post('/api/topups/quote', asyncRoute(async (req, res) => {
    res.json(await service.quoteTopup(ctx, actor(req), req.body ?? {}));
  }));

  app.post('/api/topups/confirm', asyncRoute(async (req, res) => {
    res.json(await service.confirmTopup(ctx, actor(req), req.body ?? {}));
  }));

  app.post('/api/setup', asyncRoute(async (req, res) => {
    service.requireAdmin(ctx, sessionUser(req));
    res.json(await service.connectLive(ctx, req.body ?? {}));
  }));

  app.post('/api/setup/pay2', asyncRoute(async (req, res) => {
    service.requireAdmin(ctx, sessionUser(req));
    res.json(await service.connectPay2(ctx, req.body ?? {}));
  }));

  app.get('/api/upgrade', (_req, res) => {
    res.json({
      priceUsd: config.upgradePriceUsd,
      currency: 'usd',
      product: 'G Cards EU platform 31.2.7 dedicated server package',
      currencyAsset: 'USDC',
      usdcAddress: config.upgradeUsdcAddress || null,
      includes: [
        'Programming language upgrade to 31.2.7',
        'Dedicated Frankfurt server paid in USDC (legacy host too slow)',
        'Issuing VPS for the more powerful build',
        'Old → new migration + payment-location data deletion',
        'Card spend funded by desk tokens (separate from server fee)',
        'Business prepaid metal · $1M / tx · no KYC',
      ],
    });
  });

  app.post('/api/upgrade', asyncRoute(async (req, res) => {
    res.status(201).json(service.requestUpgrade(ctx, req.body ?? {}));
  }));

  app.post('/api/card/topup-pay2', asyncRoute(async (req, res) => {
    res.json(await service.topUpPay2Card(ctx, actor(req), req.body ?? {}));
  }));

  app.post('/api/admin/clients', asyncRoute(async (req, res) => {
    res.status(201).json(await service.createClient(ctx, sessionUser(req), req.body ?? {}));
  }));

  app.get('/api/admin/desk', asyncRoute((req, res) => {
    res.json(service.adminDesk(ctx, sessionUser(req)));
  }));

  app.get('/api/wallet/message', asyncRoute((req, res) => {
    res.json(service.walletMessage(ctx, actor(req), String(req.query.address ?? '')));
  }));

  app.post('/api/wallet/link', asyncRoute(async (req, res) => {
    res.json(await service.linkWallet(ctx, actor(req), req.body ?? {}));
  }));

  app.get('/api/wallet/holdings', asyncRoute(async (req, res) => {
    res.json(await service.walletHoldings(ctx, actor(req)));
  }));

  app.get('/api/wallet/qr', asyncRoute(async (req, res) => {
    res.json(await service.depositQr(ctx, actor(req), {
      tokenId: String(req.query.tokenId ?? ''),
      amount: String(req.query.amount ?? ''),
    }));
  }));

  app.post('/api/card', asyncRoute(async (req, res) => {
    const ip = (req.ip || req.socket.remoteAddress || '127.0.0.1').replace(/^::ffff:/, '');
    const result = await service.issueCard(ctx, actor(req), req.body ?? {}, ip);
    res.status(result.status === 'issued' ? 201 : 200).json(result);
  }));

  app.post('/api/card/sync', asyncRoute(async (req, res) => {
    res.json(await service.syncCard(ctx, actor(req)));
  }));

  app.post('/api/wallets/apple', asyncRoute(async (req, res) => {
    const body = req.body ?? {};
    if (Array.isArray(body.certChain) && body.certChain.length > 0) {
      res.json(await service.ephemeralKey(ctx, actor(req), body));
      return;
    }
    res.json(service.describeWallet(ctx, actor(req), 'apple_pay'));
  }));

  app.post('/api/wallets/google', asyncRoute((req, res) => {
    res.json(service.describeWallet(ctx, actor(req), 'google_pay'));
  }));

  app.post('/api/wallets/samsung', asyncRoute(async (req, res) => {
    res.json(await service.samsungProvision(ctx, actor(req), req.body ?? {}));
  }));

  app.post('/api/wallets/ephemeral-key', asyncRoute(async (req, res) => {
    res.json(await service.ephemeralKey(ctx, actor(req), req.body ?? {}));
  }));

  app.post('/api/wallets/secure-details', asyncRoute(async (req, res) => {
    res.json(await service.secureCardLink(ctx, actor(req)));
  }));

  app.post('/api/wallets/events', asyncRoute((req, res) => {
    res.json(service.recordWalletEvent(ctx, actor(req), req.body ?? {}));
  }));

  app.get('/api/activity', asyncRoute((req, res) => {
    res.json(service.activity(ctx, actor(req)));
  }));

  app.get('/api/operator/obligations', asyncRoute((req, res) => {
    requireOperator(req);
    res.json(service.obligations(ctx));
  }));

  app.post('/api/operator/cards/:id/vcard', asyncRoute((req, res) => {
    requireOperator(req);
    service.attachVCard(ctx, req.params.id, String(req.body?.vCardId ?? ''));
    res.json({ ok: true });
  }));

  const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public');
  app.get(['/desk', '/desk/'], (_req, res) => {
    res.sendFile(path.join(publicDir, 'desk.html'));
  });
  app.use(express.static(publicDir));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Unknown API route.' } });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    sendError(res, error);
  });

  app.locals.port = config.port;
  app.locals.links = accessLinks(config.port, config.publicBaseUrl);
  app.locals.closeStore = () => store.close();
  return app;
}
