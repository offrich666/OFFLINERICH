import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureAdmin } from './admin.ts';
import { chainById, CHAINS } from './chains.ts';
import { accessLinks } from './links.ts';
import { loadConfig, overlaySaved, readiness, type Config, type Env } from './config.ts';
import type { RpcClient } from './erc20.ts';
import { HttpError } from './errors.ts';
import { createImmersveIssuer, createUnavailableIssuer } from './issuer.ts';
import { createPriceClient, type PriceClient } from './prices.ts';
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

  app.use(express.json({ limit: '64kb' }));

  function setSession(res: Response, token: string): void {
    const secure = config.secureCookies ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${cookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`);
  }

  function requireUser(req: Request): string {
    const token = sessionToken(req);
    const session = token ? store.getSession(token) : undefined;
    if (!session) throw new HttpError(401, 'auth_required', 'Sign in to continue.');
    return session.userId;
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
    res.json({
      issuer: config.livemode ? 'immersve' : 'unconfigured',
      livemode: config.livemode,
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
      links: accessLinks(config.port),
    });
  });

  app.post('/api/register', asyncRoute(async (req, res) => {
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
    res.json(service.me(ctx, requireUser(req)));
  }));

  app.get('/api/tokens', asyncRoute(async (req, res) => {
    res.json(await service.listTokens(ctx, requireUser(req)));
  }));

  app.post('/api/tokens', asyncRoute(async (req, res) => {
    res.status(201).json(await service.addToken(ctx, requireUser(req), req.body ?? {}));
  }));

  app.post('/api/topups/quote', asyncRoute(async (req, res) => {
    res.json(await service.quoteTopup(ctx, requireUser(req), req.body ?? {}));
  }));

  app.post('/api/topups/confirm', asyncRoute(async (req, res) => {
    res.json(await service.confirmTopup(ctx, requireUser(req), req.body ?? {}));
  }));

  app.post('/api/setup', asyncRoute(async (req, res) => {
    service.requireAdmin(ctx, requireUser(req));
    res.json(await service.connectLive(ctx, req.body ?? {}));
  }));

  app.get('/api/admin/desk', asyncRoute((req, res) => {
    res.json(service.adminDesk(ctx, requireUser(req)));
  }));

  app.get('/api/wallet/message', asyncRoute((req, res) => {
    res.json(service.walletMessage(ctx, requireUser(req), String(req.query.address ?? '')));
  }));

  app.post('/api/wallet/link', asyncRoute(async (req, res) => {
    res.json(await service.linkWallet(ctx, requireUser(req), req.body ?? {}));
  }));

  app.get('/api/wallet/holdings', asyncRoute(async (req, res) => {
    res.json(await service.walletHoldings(ctx, requireUser(req)));
  }));

  app.get('/api/wallet/qr', asyncRoute(async (req, res) => {
    res.json(await service.depositQr(ctx, requireUser(req), {
      tokenId: String(req.query.tokenId ?? ''),
      amount: String(req.query.amount ?? ''),
    }));
  }));

  app.post('/api/card', asyncRoute(async (req, res) => {
    const ip = (req.ip || req.socket.remoteAddress || '127.0.0.1').replace(/^::ffff:/, '');
    const result = await service.issueCard(ctx, requireUser(req), req.body ?? {}, ip);
    res.status(result.status === 'issued' ? 201 : 200).json(result);
  }));

  app.post('/api/card/sync', asyncRoute(async (req, res) => {
    res.json(await service.syncCard(ctx, requireUser(req)));
  }));

  app.post('/api/wallets/apple', asyncRoute(async (req, res) => {
    const body = req.body ?? {};
    if (Array.isArray(body.certChain) && body.certChain.length > 0) {
      res.json(await service.ephemeralKey(ctx, requireUser(req), body));
      return;
    }
    res.json(service.describeWallet(ctx, requireUser(req), 'apple_pay'));
  }));

  app.post('/api/wallets/google', asyncRoute((req, res) => {
    res.json(service.describeWallet(ctx, requireUser(req), 'google_pay'));
  }));

  app.post('/api/wallets/samsung', asyncRoute(async (req, res) => {
    res.json(await service.samsungProvision(ctx, requireUser(req), req.body ?? {}));
  }));

  app.post('/api/wallets/ephemeral-key', asyncRoute(async (req, res) => {
    res.json(await service.ephemeralKey(ctx, requireUser(req), req.body ?? {}));
  }));

  app.post('/api/wallets/secure-details', asyncRoute(async (req, res) => {
    res.json(await service.secureCardLink(ctx, requireUser(req)));
  }));

  app.post('/api/wallets/events', asyncRoute((req, res) => {
    res.json(service.recordWalletEvent(ctx, requireUser(req), req.body ?? {}));
  }));

  app.get('/api/activity', asyncRoute((req, res) => {
    res.json(service.activity(ctx, requireUser(req)));
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
  app.use(express.static(publicDir));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Unknown API route.' } });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    sendError(res, error);
  });

  app.locals.port = config.port;
  app.locals.links = accessLinks(config.port);
  app.locals.closeStore = () => store.close();
  return app;
}
