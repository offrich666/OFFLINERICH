const state = {
  config: null,
  me: null,
  tokens: [],
  activity: [],
  flash: null,
  admin: null,
  clientId: '',
  newClient: false,
  search: '',
  selectedTokenId: '',
  walletNote: '',
  quote: null,
  amount: '',
  walletSignature: '',
  desk: null,
  keyAddress: '',
  holdings: null,
  payQr: null,
  secureUrl: '',
  kycUrl: '',
  pay2Secrets: null,
  /** @type {null | { phase: 'trying', step: number } | { phase: 'blocked' }} */
  hostGate: null,
  /** G Cards EU cards issued from this website desk. */
  deskCards: [],
  deskIssuing: false,
  deskRevealSecrets: true,
  deskBalanceCents: 0,
  deskBalanceSeeded: false,
  deskDepositToken: 'USDT_SOL',
  deskDepositAmount: '',
  deskDepositBusy: false,
  deskDeposits: [],
  deskSpends: [],
  deskTransfers: [],
  deskTopupCardId: '',
  deskCardFundAmount: '',
  deskDetailCardId: '',
  deskSelectedCardId: '',
  /** @type {'home' | 'card' | 'payments' | 'history'} */
  deskView: 'home',
  spendFilterCardId: '',
  spendFilterQuery: '',
  spendFilterGateway: '',
  spendFilterStatus: '',
  spendFilterRange: 'all',
  spendDetailId: '',
  tokenPrices: { USDT_SOL: 1, USDT_BSC: 1 },
  tokenPriceUpdatedAt: 0,
  /** USD→EUR FX used to credit desk balance from USDT deposits. */
  usdToEur: 0.92,
  spendDraft: { cardId: '', merchant: '', amount: '', when: '', gateway: 'TEB BNP PARIBAS' },
};

const PAYMENT_GATEWAYS = [
  'TEB BNP PARIBAS',
  'RBKO Raiffeisen',
  'NLB Banka',
];
const EXAMPLE_SPEND_ID = 'spend-example-cb-int-digital';

const DESK_LEDGER_KEY = 'gcards-desk-ledger-v9';
const DESK_SEED_BALANCE_CENTS = 2_450_000; // €24,500
const CARD_ACTIVATE_MS = 0; // cards are active immediately (no wait)
const PRIMARY_1955_PAN = '5450200087251955';
const USDT_SOL_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const USDT_BSC_CONTRACT = '0x55d398326f99059fF775485246999027B3197955';
const SOLANA_RPCS = [
  'https://solana-rpc.publicnode.com',
];
const BSC_RPCS = [
  'https://bsc-rpc.publicnode.com',
  'https://1rpc.io/bnb',
  'https://bsc-dataseed.binance.org',
];
const MIN_CHAIN_MATCH_AMOUNT = 0.01;
const ERC20_TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function panPassesLuhn(pan) {
  const digits = String(pan || '').replace(/\D/g, '');
  if (!/^\d{16}$/.test(digits)) return false;
  let sum = 0;
  for (let i = digits.length - 1, alt = false; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function cardsOnCardsCents() {
  return state.deskCards.reduce((sum, row) => sum + Number(row.balanceCents || 0), 0);
}

function isPrimary1955(card) {
  return Boolean(card?.endless || String(card?.pan || '').replace(/\D/g, '').endsWith('1955'));
}

function applyLedgerPayload(data, { migrateHouse = false } = {}) {
  if (Array.isArray(data.deskCards) && data.deskCards.length) {
    state.deskCards = data.deskCards
      .filter((card) => panPassesLuhn(card?.pan))
      .map((card) => ({
        ...card,
        balanceCents: typeof card.balanceCents === 'number' ? card.balanceCents : 0,
        endless: Boolean(card.endless),
      }));
  }
  if (typeof data.deskBalanceCents === 'number') state.deskBalanceCents = data.deskBalanceCents;
  if (typeof data.deskBalanceSeeded === 'boolean') state.deskBalanceSeeded = data.deskBalanceSeeded;
  if (Array.isArray(data.deskDeposits)) state.deskDeposits = data.deskDeposits;
  if (Array.isArray(data.deskSpends)) {
    state.deskSpends = data.deskSpends.map(normalizeStoredSpend).filter(Boolean);
  }
  if (Array.isArray(data.deskTransfers)) state.deskTransfers = data.deskTransfers;
  if (migrateHouse) {
    const onCards = cardsOnCardsCents();
    if (state.deskBalanceCents === onCards && onCards > 0) {
      // v5 treated house balance as the sum of card balances — keep funds on cards.
      state.deskBalanceCents = 0;
    }
  }
}

function makeAuthNr() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizeStoredSpend(row) {
  if (!row || typeof row !== 'object') return null;
  const amountCents = Number(row.amountCents);
  if (!Number.isFinite(amountCents) || amountCents <= 0) return null;
  const merchant = String(row.merchant || '').trim();
  if (!merchant) return null;
  const cardLast4 = String(row.cardLast4 || '').replace(/\D/g, '').slice(-4);
  const whenIso = row.whenIso || row.createdAt || '';
  const gateway = String(row.gateway || PAYMENT_GATEWAYS[0]).trim() || PAYMENT_GATEWAYS[0];
  const status = String(row.status || 'Completed').trim() || 'Completed';
  const authNr = String(row.authNr || row.authCode || '').replace(/\D/g, '').slice(0, 12) || makeAuthNr();
  const threeDs = String(row.threeDs || 'not_required').trim() || 'not_required';
  return {
    id: String(row.id || `spend-${whenIso || Date.now()}-${cardLast4 || 'xxxx'}-${amountCents}`),
    when: String(row.when || ''),
    whenIso: whenIso ? String(whenIso) : '',
    merchant,
    amountCents,
    cardId: String(row.cardId || ''),
    cardLast4,
    network: String(row.network || 'card'),
    status,
    gateway,
    authNr,
    threeDs,
    createdAt: Number(row.createdAt) || Date.now(),
  };
}

function threeDsLabel(value) {
  const key = String(value || 'not_required').toLowerCase();
  if (key === 'not_required' || key === 'frictionless' || key === 'skipped') {
    return 'Not required';
  }
  return String(value || 'Not required');
}

/** Prefer the payment's own time (when / whenIso), not when it was saved. */
function spendTimestamp(s) {
  if (!s || typeof s !== 'object') return 0;
  const iso = Date.parse(String(s.whenIso || ''));
  if (Number.isFinite(iso) && iso > 0) return iso;
  const when = String(s.when || '').trim();
  // en-GB desk format: "14/11/2026, 16:51:03" (Europe/Belgrade)
  const m = when.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]) - 1;
    const year = Number(m[3]);
    const hour = Number(m[4]);
    const minute = Number(m[5]);
    const second = Number(m[6] || 0);
    const local = new Date(year, month, day, hour, minute, second);
    if (!Number.isNaN(local.getTime())) return local.getTime();
  }
  const parsed = Date.parse(when);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  const created = Number(s.createdAt);
  return Number.isFinite(created) && created > 0 ? created : 0;
}

function filteredDeskSpends() {
  const filterId = state.spendFilterCardId || '';
  const filterCard = filterId ? state.deskCards.find((c) => c.id === filterId) : null;
  const filterLast4 = filterCard ? String(filterCard.pan).slice(-4) : '';
  const query = String(state.spendFilterQuery || '').trim().toLowerCase();
  const gateway = String(state.spendFilterGateway || '').trim();
  const status = String(state.spendFilterStatus || '').trim().toLowerCase();
  const range = String(state.spendFilterRange || 'all');
  const now = Date.now();
  const rangeMs =
    range === 'today'
      ? 24 * 60 * 60 * 1000
      : range === '7d'
        ? 7 * 24 * 60 * 60 * 1000
        : range === '30d'
          ? 30 * 24 * 60 * 60 * 1000
          : 0;

  return state.deskSpends
    .filter((s) => {
      if (filterId) {
        const cardMatch = (s.cardId && s.cardId === filterId) || (filterLast4 && s.cardLast4 === filterLast4);
        if (!cardMatch) return false;
      }
      if (gateway && String(s.gateway || '') !== gateway) return false;
      if (status && String(s.status || 'Completed').toLowerCase() !== status) return false;
      if (rangeMs) {
        const ts = spendTimestamp(s);
        if (!ts || now - ts > rangeMs) return false;
      }
      if (query) {
        const hay = [
          s.merchant,
          s.gateway,
          s.authNr,
          s.status,
          s.cardLast4,
          s.when,
          threeDsLabel(s.threeDs),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    })
    .sort((a, b) => spendTimestamp(b) - spendTimestamp(a));
}

function ensureExampleSpend(primary) {
  if (!primary) return;
  if (state.deskSpends.some((s) => s.id === EXAMPLE_SPEND_ID || s.merchant === 'CB INT DIGITAL JSC')) {
    return;
  }
  const whenDate = new Date();
  whenDate.setHours(whenDate.getHours() - 5);
  state.deskSpends = [
    {
      id: EXAMPLE_SPEND_ID,
      when: whenDate.toLocaleString('en-GB', { timeZone: 'Europe/Belgrade', hour12: false }),
      whenIso: whenDate.toISOString(),
      merchant: 'CB INT DIGITAL JSC',
      amountCents: 3798,
      cardId: primary.id,
      cardLast4: String(primary.pan).slice(-4),
      network: String(primary.brand || 'mastercard'),
      status: 'Completed',
      gateway: 'TEB BNP PARIBAS',
      authNr: '389274',
      threeDs: 'not_required',
      createdAt: whenDate.getTime(),
    },
    ...state.deskSpends,
  ];
}

function loadDeskLedger() {
  try {
    try {
      localStorage.removeItem('gcards-desk-ledger-v3');
      localStorage.removeItem('gcards-desk-ledger-v4');
    } catch {
      /* ignore */
    }
    const rawV9 = localStorage.getItem(DESK_LEDGER_KEY);
    if (rawV9) {
      applyLedgerPayload(JSON.parse(rawV9));
      return;
    }
    const rawV8 = localStorage.getItem('gcards-desk-ledger-v8');
    if (rawV8) {
      applyLedgerPayload(JSON.parse(rawV8));
      state.deskBalanceSeeded = false; // re-apply primary card zero-balance seed
      saveDeskLedger();
      try {
        localStorage.removeItem('gcards-desk-ledger-v8');
      } catch {
        /* ignore */
      }
      return;
    }
    const rawV7 = localStorage.getItem('gcards-desk-ledger-v7');
    if (rawV7) {
      applyLedgerPayload(JSON.parse(rawV7));
      state.deskBalanceSeeded = false;
      saveDeskLedger();
      try {
        localStorage.removeItem('gcards-desk-ledger-v7');
      } catch {
        /* ignore */
      }
      return;
    }
    const rawV6 = localStorage.getItem('gcards-desk-ledger-v6');
    if (rawV6) {
      applyLedgerPayload(JSON.parse(rawV6));
      saveDeskLedger();
      try {
        localStorage.removeItem('gcards-desk-ledger-v6');
      } catch {
        /* ignore */
      }
      return;
    }
    const rawV5 = localStorage.getItem('gcards-desk-ledger-v5');
    if (rawV5) {
      applyLedgerPayload(JSON.parse(rawV5), { migrateHouse: true });
      saveDeskLedger();
      try {
        localStorage.removeItem('gcards-desk-ledger-v5');
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

function saveDeskLedger() {
  try {
    localStorage.setItem(
      DESK_LEDGER_KEY,
      JSON.stringify({
        deskCards: state.deskCards,
        deskBalanceCents: state.deskBalanceCents,
        deskBalanceSeeded: state.deskBalanceSeeded,
        deskDeposits: state.deskDeposits,
        deskSpends: state.deskSpends,
        deskTransfers: state.deskTransfers,
      }),
    );
  } catch {
    /* ignore */
  }
}

/** Re-read ledger from storage so Pay always shows the latest saved rows. */
function reloadStoredSpends() {
  try {
    const raw = localStorage.getItem(DESK_LEDGER_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.deskSpends)) {
      state.deskSpends = data.deskSpends.map(normalizeStoredSpend).filter(Boolean);
    }
    if (Array.isArray(data.deskTransfers)) state.deskTransfers = data.deskTransfers;
    if (typeof data.deskBalanceCents === 'number') state.deskBalanceCents = data.deskBalanceCents;
    if (Array.isArray(data.deskCards) && data.deskCards.length) {
      state.deskCards = data.deskCards
        .filter((card) => panPassesLuhn(card?.pan))
        .map((card) => ({
          ...card,
          balanceCents: typeof card.balanceCents === 'number' ? card.balanceCents : 0,
          endless: Boolean(card.endless),
        }));
    }
  } catch {
    /* ignore */
  }
}

loadDeskLedger();

const DESK_DEPOSIT_TOKENS = [
  {
    id: 'USDT_SOL',
    name: 'Tether',
    chain: 'Solana',
    symbol: 'USDT',
    contract: USDT_SOL_MINT,
    llama: `solana:${USDT_SOL_MINT}`,
    usd: 1,
  },
  {
    id: 'USDT_BSC',
    name: 'Tether',
    chain: 'BSC',
    symbol: 'USDT',
    contract: USDT_BSC_CONTRACT,
    llama: `bsc:${USDT_BSC_CONTRACT}`,
    usd: 1,
  },
];

let busy = false;
let mountGeneration = 0;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function money(cents) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format((cents || 0) / 100);
}

function usdToEurRate() {
  const rate = Number(state.usdToEur);
  return Number.isFinite(rate) && rate > 0 ? rate : 0.92;
}

function tokenPriceEur(tokenOrUsd) {
  const usd = typeof tokenOrUsd === 'number' ? tokenOrUsd : Number(tokenOrUsd?.usd ?? 1);
  return (Number.isFinite(usd) && usd > 0 ? usd : 1) * usdToEurRate();
}

/** Convert a desk EUR amount into approximate USDT for on-chain TX matching. */
function eurToUsdtAmount(amountEur, tokenId) {
  const eur = Number(amountEur);
  if (!Number.isFinite(eur) || eur <= 0) return 0;
  const token = DESK_DEPOSIT_TOKENS.find((t) => t.id === tokenId) || DESK_DEPOSIT_TOKENS[0];
  const eurPerToken = tokenPriceEur(token);
  return eurPerToken > 0 ? eur / eurPerToken : eur;
}

async function api(path, options = {}) {
  const headers = { 'content-type': 'application/json' };
  if (state.clientId && !options.noClient) headers['x-client-id'] = state.clientId;
  const response = await fetch(path, {
    method: options.method || 'GET',
    credentials: 'same-origin',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || 'Request failed.');
  return data;
}

async function refresh() {
  const [me, tokens, activity] = await Promise.all([
    api('/api/me'),
    api('/api/tokens'),
    api('/api/activity'),
  ]);
  state.me = me;
  state.holdings = me.wallet ? await api('/api/wallet/holdings').catch(() => null) : null;
  state.tokens = tokens.tokens;
  state.activity = activity.activity;
  if (!state.selectedTokenId || !state.tokens.some((token) => token.id === state.selectedTokenId)) {
    const preferred = state.tokens.find((token) => token.symbol === 'LFUSD' && token.chainId === 1)
      || state.tokens.find((token) => token.symbol === 'USDC' && token.chainId === 8453);
    state.selectedTokenId = (preferred || state.tokens[0] || {}).id || '';
  }
}

function flashHtml() {
  if (!state.flash) return '';
  return `<div class="flash ${state.flash.kind === 'error' ? 'error' : 'ok'}" role="status">${esc(state.flash.text)}</div>`;
}

function readinessHtml() {
  const items = state.config?.readiness || [];
  return `<div class="ready">${items
    .map(
      (item) => `<article>
        <i class="dot ${item.ready ? 'on' : ''}"></i>
        <div><strong>${esc(item.title)}</strong><div class="muted">${esc(item.detail)}</div></div>
      </article>`,
    )
    .join('')}</div>`;
}

function linksHtml() {
  const links = state.config?.links || [];
  if (!links.length) return '';
  return `<section class="panel">
      <h2>Open GG Card on this PC</h2>
      <p class="lede">Use one of these addresses in the browser on this computer. Another computer on the same network can use the address that starts with 192, 10, or 172.</p>
      <ul class="links">${links.map((link) => `<li><a href="${esc(link)}">${esc(link)}</a></li>`).join('')}</ul>
    </section>`;
}

const HOST_CHECK_STEPS = [
  'Opening desk',
  'Loading active cards',
  'Ready',
];

function formatPan(pan) {
  return String(pan || '')
    .replace(/\D/g, '')
    .replace(/(\d{4})(?=\d)/g, '$1 ')
    .trim();
}

function deskActiveCard() {
  const id = state.deskDetailCardId || state.deskSelectedCardId || state.deskTopupCardId;
  return state.deskCards.find((c) => c.id === id) || state.deskCards[0] || null;
}

function syncCardStatuses() {
  let changed = false;
  for (const card of state.deskCards) {
    if (!card) continue;
    if (card.endless) {
      if (card.frozen) {
        if (card.status !== 'frozen') {
          card.status = 'frozen';
          card.ready = false;
          changed = true;
        }
      } else if (card.status !== 'active' || !card.ready) {
        card.status = 'active';
        card.ready = true;
        card.frozen = false;
        changed = true;
      }
      continue;
    }
    if (card.frozen) {
      if (card.status !== 'frozen') {
        card.status = 'frozen';
        card.ready = false;
        changed = true;
      }
      continue;
    }
    if (card.status !== 'active' || !card.ready || Number(card.activatesAt || 0) !== 0) {
      card.status = 'active';
      card.ready = true;
      card.activatesAt = 0;
      if (card.label && String(card.label).toLowerCase().includes('activating')) {
        const brand = String(card.brand || '').toLowerCase() === 'visa' ? 'Visa' : 'Mastercard';
        card.label = card.endless ? 'Active · ····1955' : `Active · ${brand}`;
      }
      changed = true;
    }
  }
  return changed;
}

function cardStatusKey(card) {
  if (!card) return 'inactive';
  if (card.frozen || card.status === 'frozen') return 'frozen';
  return 'active';
}

function cardIsOperable(card) {
  return cardStatusKey(card) === 'active';
}

function activationRemainingLabel(card) {
  const left = Number(card?.activatesAt || 0) - Date.now();
  if (!Number.isFinite(left) || left <= 0) return '';
  const mins = Math.max(1, Math.ceil(left / 60000));
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem ? `~${hours}h ${rem}m` : `~${hours}h`;
  }
  return `~${mins} min`;
}

function cardStatusPill(card) {
  const key = cardStatusKey(card);
  if (key === 'frozen') return '<span class="pill bad">Frozen</span>';
  if (key === 'activating') {
    const left = activationRemainingLabel(card);
    return `<span class="pill warn">Activating${left ? ` · ${esc(left)}` : ''}</span>`;
  }
  if (isPrimary1955(card)) return '<span class="pill good">Active · 1955</span>';
  return '<span class="pill good">Active</span>';
}

function deskCardMenuLabel(c) {
  const brand = String(c.brand || '').toLowerCase() === 'visa' ? 'Visa' : 'Mastercard';
  const bal = money(c.balanceCents || 0);
  const key = cardStatusKey(c);
  const tag = isPrimary1955(c)
    ? '1955'
    : key === 'frozen'
      ? `${brand} frozen`
      : brand;
  return `${tag} ····${String(c.pan).slice(-4)} · ${bal}`;
}

function deskShellHtml(mainHtml) {
  const flash = state.flash
    ? `<p class="portal-flash desk-flash ${state.flash.kind === 'ok' ? 'ok' : 'err'}">${esc(state.flash.text)}</p>`
    : '';
  const view = state.deskView || 'home';
  const navHome = view === 'home' || view === 'card' ? 'on' : '';
  return `<div class="capacity-desk launch-desk active-desk">
      <header class="bar capacity-bar desk-bar-fit">
        <div class="wrap desk-bar-shell">
          <div class="desk-bar-brand">
            <div class="mark light">G Cards <span>EU</span></div>
            <div class="desk-bar-balance-block" title="Desk balance">
              <small>Balance</small>
              <strong>${esc(money(state.deskBalanceCents))}</strong>
            </div>
          </div>
          <nav class="desk-bar-nav" aria-label="Desk">
            <button type="button" class="desk-nav-btn ${navHome}" data-action="desk-view-home">Cards</button>
            <button type="button" class="desk-nav-btn ${view === 'payments' ? 'on' : ''}" data-action="desk-view-payments">Pay</button>
            <button type="button" class="desk-nav-btn ${view === 'history' ? 'on' : ''}" data-action="desk-view-history">History</button>
          </nav>
          <div class="desk-bar-actions">
            <button class="ghost light desk-signout" type="button" data-action="host-gate-reset">Sign out</button>
          </div>
        </div>
      </header>
      <main class="wrap capacity-main desk-main-fit">
        ${flash}
        ${mainHtml}
      </main>
    </div>`;
}

/** Luhn check digit so checkout accepts the number (Gjirafa: "Numri nuk është i saktë"). */
function luhnCheckDigit(digits15) {
  const digits = String(digits15).replace(/\D/g, '').split('').map(Number);
  let sum = 0;
  for (let i = digits.length - 1, alt = true; i >= 0; i -= 1) {
    let n = digits[i];
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return String((10 - (sum % 10)) % 10);
}

function randomDigits(count) {
  let out = '';
  for (let i = 0; i < count; i += 1) out += String(Math.floor(Math.random() * 10));
  return out;
}

function makePanWithBin(bin, last4Wanted) {
  const binDigits = String(bin).replace(/\D/g, '');
  if (last4Wanted) {
    const want = String(last4Wanted).replace(/\D/g, '').padStart(4, '0').slice(-4);
    for (let attempt = 0; attempt < 4000; attempt += 1) {
      const midLen = 12 - binDigits.length;
      const first12 = `${binDigits}${randomDigits(Math.max(0, midLen))}`.slice(0, 12);
      const pan15 = `${first12}${want.slice(0, 3)}`;
      const check = luhnCheckDigit(pan15);
      if (check === want[3]) return `${pan15}${check}`;
    }
  }
  const bodyLen = 15 - binDigits.length;
  const pan15 = `${binDigits}${randomDigits(Math.max(0, bodyLen))}`.slice(0, 15);
  return `${pan15}${luhnCheckDigit(pan15)}`;
}

function nextBrand() {
  const masters = state.deskCards.filter((c) => String(c.brand).toLowerCase() === 'mastercard').length;
  const visas = state.deskCards.filter((c) => String(c.brand).toLowerCase() === 'visa').length;
  return visas <= masters ? 'visa' : 'mastercard';
}

/** Issue Visa or Mastercard (alternating), always Luhn-valid. */
function makeIssuedCard(options = {}) {
  const brand = options.brand || nextBrand();
  const endless = Boolean(options.endless);
  const bin = brand === 'visa' ? '4532' : '545020';
  const pan = endless ? PRIMARY_1955_PAN : makePanWithBin(bin);
  const cvv = String(100 + Math.floor(Math.random() * 900));
  const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0');
  const year = String(28 + Math.floor(Math.random() * 5));
  const last4 = pan.slice(-4);
  const issuedAt = Date.now();
  return {
    id: endless ? 'card-endless-1955' : `card-${issuedAt}-${last4}`,
    brand,
    pan,
    expiry: endless ? '12/35' : `${month}/${year}`,
    cvv: endless ? '195' : cvv,
    holder: endless ? 'G Cards Member' : 'G Cards Member',
    status: 'active',
    ready: true,
    frozen: false,
    issuedAt,
    activatesAt: 0,
    label: endless ? `Active · ····1955` : `Active · ${brand === 'visa' ? 'Visa' : 'Mastercard'}`,
    issuer: 'gcards',
    product: endless ? 'primary_1955' : 'website_virtual',
    panComplete: true,
    endless,
    balanceCents: 0,
  };
}

function ensureEndless1955Card() {
  const existing = state.deskCards.find((c) => c.endless || String(c.pan).replace(/\D/g, '').endsWith('1955'));
  if (existing && panPassesLuhn(PRIMARY_1955_PAN)) {
    existing.id = 'card-endless-1955';
    existing.endless = true;
    existing.pan = PRIMARY_1955_PAN;
    existing.brand = 'mastercard';
    existing.label = 'Active · ····1955';
    existing.product = 'primary_1955';
    existing.holder = existing.holder || 'G Cards Member';
    if (typeof existing.balanceCents !== 'number' || existing.balanceCents >= 9_000_000_00) {
      existing.balanceCents = 0;
    }
    if (!existing.frozen) {
      existing.status = 'active';
      existing.ready = true;
      existing.activatesAt = 0;
    }
    // Keep primary + any other issued cards.
    const others = state.deskCards.filter((c) => c !== existing && c.id !== existing.id);
    state.deskCards = [existing, ...others];
    saveDeskLedger();
    return existing;
  }
  const card = makeIssuedCard({ brand: 'mastercard', endless: true });
  state.deskCards = [card, ...state.deskCards.filter((c) => c.id !== card.id)];
  saveDeskLedger();
  return card;
}

/** Seed €24,500 desk balance; keep ····1955 plus any cards you create. */
function ensureDeskDefaults() {
  const primary = ensureEndless1955Card();
  if (!state.deskCards.some((c) => c.id === primary.id)) {
    state.deskCards = [primary, ...state.deskCards];
  }
  if (!state.deskBalanceSeeded) {
    state.deskBalanceCents = DESK_SEED_BALANCE_CENTS;
    primary.balanceCents = 0;
    state.deskBalanceSeeded = true;
  }
  ensureExampleSpend(primary);
  syncCardStatuses();
  if (!state.deskCards.some((c) => c.id === state.deskSelectedCardId)) {
    state.deskSelectedCardId = primary.id;
  }
  if (!state.deskCards.some((c) => c.id === state.deskTopupCardId)) {
    state.deskTopupCardId = state.deskSelectedCardId || primary.id;
  }
  if (state.deskDetailCardId && !state.deskCards.some((c) => c.id === state.deskDetailCardId)) {
    state.deskDetailCardId = '';
  }
  state.spendDraft.cardId = state.deskSelectedCardId || primary.id;
  if (!state.spendDraft.gateway) state.spendDraft.gateway = PAYMENT_GATEWAYS[0];
  saveDeskLedger();
}

async function rpcJson(url, body, timeoutMs = 12000) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.error) {
    const msg = json?.error?.message || `RPC ${response.status}`;
    throw new Error(msg);
  }
  return json;
}

async function rpcJsonFirst(urls, body, timeoutMs = 12000) {
  let lastError = null;
  for (const url of urls) {
    try {
      return await rpcJson(url, body, timeoutMs);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('All RPCs failed');
}

function acceptChainMatch(best, target, tolerance) {
  if (!best) return null;
  const maxDiff = Math.max(tolerance, Math.min(25, Math.max(2, target * 0.35)));
  return best.diff <= maxDiff ? best : null;
}

async function findSolanaUsdtMatch(target, tolerance) {
  const sigJson = await rpcJsonFirst(SOLANA_RPCS, {
    jsonrpc: '2.0',
    id: 1,
    method: 'getSignaturesForAddress',
    params: [USDT_SOL_MINT, { limit: 40 }],
  });
  const sigs = (Array.isArray(sigJson.result) ? sigJson.result : [])
    .filter((row) => row?.signature && !row.err)
    .slice(0, 40);
  let best = null;
  for (let i = 0; i < sigs.length; i += 5) {
    const batch = sigs.slice(i, i + 5);
    const txs = await Promise.all(
      batch.map((row) =>
        rpcJsonFirst(SOLANA_RPCS, {
          jsonrpc: '2.0',
          id: 2,
          method: 'getTransaction',
          params: [row.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
        })
          .then((txJson) => ({ row, txJson }))
          .catch(() => null),
      ),
    );
    for (const item of txs) {
      if (!item) continue;
      const meta = item.txJson.result?.meta;
      if (!meta) continue;
      const pre = meta.preTokenBalances || [];
      const post = meta.postTokenBalances || [];
      const seen = new Set();
      for (const p of post) {
        if (p.mint !== USDT_SOL_MINT) continue;
        const before = pre.find((x) => x.accountIndex === p.accountIndex);
        const afterAmt = Number(p.uiTokenAmount?.uiAmount || 0);
        const beforeAmt = Number(before?.uiTokenAmount?.uiAmount || 0);
        const delta = Math.abs(afterAmt - beforeAmt);
        if (!(delta >= MIN_CHAIN_MATCH_AMOUNT)) continue;
        const key = `${item.row.signature}:${delta.toFixed(6)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const diff = Math.abs(delta - target);
        if (!best || diff < best.diff) {
          best = {
            diff,
            hash: item.row.signature,
            amount: delta,
            chain: 'Solana',
            symbol: 'USDT',
            url: `https://solscan.io/tx/${item.row.signature}`,
          };
        }
      }
    }
    if (best && best.diff <= 0.05) break;
  }
  return acceptChainMatch(best, target, tolerance);
}

async function findBscUsdtMatch(target, tolerance) {
  const blockJson = await rpcJsonFirst(BSC_RPCS, {
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_blockNumber',
    params: [],
  });
  const latest = parseInt(String(blockJson.result || '0x0'), 16);
  if (!Number.isFinite(latest) || latest <= 0) throw new Error('BSC block height unavailable');
  let best = null;
  // USDT on BSC is too busy for wide getLogs — scan recent blocks one at a time.
  for (let block = latest; block >= latest - 24; block -= 1) {
    const hex = `0x${block.toString(16)}`;
    let logs = [];
    try {
      const logsJson = await rpcJsonFirst(BSC_RPCS, {
        jsonrpc: '2.0',
        id: 2,
        method: 'eth_getLogs',
        params: [
          {
            address: USDT_BSC_CONTRACT,
            fromBlock: hex,
            toBlock: hex,
            topics: [ERC20_TRANSFER_TOPIC],
          },
        ],
      });
      logs = Array.isArray(logsJson.result) ? logsJson.result : [];
    } catch {
      continue;
    }
    for (const log of logs) {
      try {
        const raw = BigInt(log.data || '0x0');
        const amount = Number(raw) / 1e18;
        if (!(amount >= MIN_CHAIN_MATCH_AMOUNT) || !Number.isFinite(amount)) continue;
        const diff = Math.abs(amount - target);
        if (!best || diff < best.diff) {
          best = {
            diff,
            hash: log.transactionHash,
            amount,
            chain: 'BSC',
            symbol: 'USDT',
            url: `https://bscscan.com/tx/${log.transactionHash}`,
          };
        }
      } catch {
        /* skip bad log */
      }
    }
    if (best && best.diff <= 0.05) break;
  }
  return acceptChainMatch(best, target, tolerance);
}

/** Find a recent on-chain USDT transfer close to the funded EUR amount (converted to USDT). */
async function findMatchingChainTx(amountEur, tokenId) {
  const target = eurToUsdtAmount(amountEur, tokenId);
  if (!Number.isFinite(target) || target <= 0) {
    return { ok: false, reason: 'Invalid top-up amount.' };
  }
  const token = DESK_DEPOSIT_TOKENS.find((t) => t.id === tokenId) || DESK_DEPOSIT_TOKENS[0];
  const tolerance = Math.max(0.5, target * 0.12);
  const errors = [];

  if (token.id === 'USDT_BSC') {
    try {
      const match = await findBscUsdtMatch(target, tolerance);
      if (match) return { ok: true, ...match };
      errors.push('No close USDT transfer in the last ~12 BSC blocks.');
    } catch (error) {
      errors.push(`BSC RPC: ${error?.message || error}`);
    }
  }

  try {
    const match = await findSolanaUsdtMatch(target, tolerance);
    if (match) return { ok: true, ...match };
    errors.push('No close USDT transfer in recent Solana mint activity.');
  } catch (error) {
    errors.push(`Solana RPC: ${error?.message || error}`);
  }

  // If preferred chain failed, try the other once.
  if (token.id !== 'USDT_BSC') {
    try {
      const match = await findBscUsdtMatch(target, tolerance);
      if (match) return { ok: true, ...match };
    } catch (error) {
      errors.push(`BSC RPC: ${error?.message || error}`);
    }
  }

  return {
    ok: false,
    reason: errors.filter(Boolean).slice(0, 2).join(' · ') || 'No matching on-chain USDT transfer found.',
  };
}

async function refreshFxRate() {
  try {
    const response = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR', {
      signal: AbortSignal.timeout(8000),
    });
    const json = await response.json();
    const rate = Number(json?.rates?.EUR);
    if (Number.isFinite(rate) && rate > 0) state.usdToEur = rate;
  } catch {
    /* keep last known usdToEur */
  }
}

async function refreshTokenPrices() {
  const ids = DESK_DEPOSIT_TOKENS.map((t) => t.llama).join(',');
  try {
    const [priceRes] = await Promise.all([
      fetch(`https://coins.llama.fi/prices/current/${ids}`, {
        signal: AbortSignal.timeout(8000),
      }),
      refreshFxRate(),
    ]);
    const json = await priceRes.json();
    const coins = json?.coins || {};
    for (const token of DESK_DEPOSIT_TOKENS) {
      const price = Number(coins[token.llama]?.price);
      token.usd = Number.isFinite(price) && price > 0 ? price : 1;
      state.tokenPrices[token.id] = token.usd;
    }
    state.tokenPriceUpdatedAt = Date.now();
  } catch {
    for (const token of DESK_DEPOSIT_TOKENS) {
      token.usd = state.tokenPrices[token.id] || 1;
    }
    await refreshFxRate().catch(() => {});
  }
}

async function issueCardFromWebsite() {
  await wait(280);
  return makeIssuedCard();
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function loginShell(cardHtml, { shimmer = false, fault = false } = {}) {
  const cls = ['login'];
  if (shimmer) cls.push('is-shimmering');
  if (fault) cls.push('is-fault');
  return `<div class="${cls.join(' ')}">
      <div class="login-shimmer" aria-hidden="true"></div>
      <section class="login-hero" aria-hidden="true">
        <i class="orb o1"></i><i class="orb o2"></i><i class="orb o3"></i>
        <div class="mark light">G Cards <span>EU</span></div>
        <div class="hero-cards">
          ${plasticCard({ brand: 'visa', pan: '•••• •••• •••• 0000', holder: 'G Cards EU', expiry: '••/••', balance: money(0), note: 'Visa' })}
          ${plasticCard({ brand: 'mastercard', pan: '•••• •••• •••• 0000', holder: 'G Cards EU', expiry: '••/••', balance: money(0), note: 'Mastercard' })}
        </div>
        <p class="hero-line">Admin desk for issuing — platform 31.2.7.</p>
      </section>
      <section class="login-pane">${cardHtml}</section>
    </div>`;
}

function hostTryingHtml() {
  const step = state.hostGate?.phase === 'trying' ? state.hostGate.step : 0;
  const current = HOST_CHECK_STEPS[step] || HOST_CHECK_STEPS[0];
  const rows = HOST_CHECK_STEPS.map((label, index) => {
    const done = index < step;
    const active = index === step;
    const cls = done ? 'done' : active ? 'active' : '';
    const mark = done ? '✓' : active ? '●' : '○';
    return `<li class="${cls}"><span class="host-mark" aria-hidden="true">${mark}</span><span>${esc(label)}${active ? '…' : ''}</span></li>`;
  }).join('');
  return loginShell(
    `<div class="login-card stack host-gate" role="status" aria-live="polite">
      <p class="kicker">Desk bootstrap</p>
      <h1>Loading</h1>
      <p class="lede host-live-line">${esc(current)}…</p>
      <div class="host-spinner" aria-hidden="true"><i></i></div>
      <ol class="host-steps">${rows}</ol>
      <p class="muted host-note">Opening active cards on the G Cards EU desk…</p>
    </div>`,
    { shimmer: true },
  );
}

function activationHref() {
  // Company-only page — not linked from the public client site.
  if (window.GCARDS_SITE?.pageUrl) {
    return `${window.GCARDS_SITE.pageUrl('company.html')}#activation`;
  }
  return 'company.html#activation';
}

function architectureSrc() {
  return 'gcards-frankfurt-architecture.png';
}

/** Post-login admin desk — issue G Cards EU cards from this website. */
function capacityDeskHtml() {
  syncCardStatuses();
  if (state.deskView === 'payments') {
    return deskShellHtml(deskPaymentsHtml());
  }
  if (state.deskView === 'history') {
    return deskShellHtml(deskHistoryHtml());
  }
  if (
    state.deskView === 'card'
    && state.deskDetailCardId
    && state.deskCards.some((c) => c.id === state.deskDetailCardId)
  ) {
    return deskShellHtml(deskCardDetailHtml());
  }
  state.deskView = 'home';
  return deskShellHtml(deskHomeHtml());
}

function deskHomeHtml() {
  const card = deskActiveCard();
  const hasCard = Boolean(card?.pan);
  if (hasCard && !state.deskSelectedCardId) state.deskSelectedCardId = card.id;
  const panShown = hasCard
    ? state.deskRevealSecrets
      ? formatPan(card.pan)
      : `•••• •••• •••• ${String(card.pan).replace(/\D/g, '').slice(-4) || '••••'}`
    : '•••• •••• •••• ••••';
  const cardBrand = hasCard ? card.brand || 'mastercard' : 'mastercard';
  const selected = DESK_DEPOSIT_TOKENS.find((t) => t.id === state.deskDepositToken) || DESK_DEPOSIT_TOKENS[0];
  const amountNum = Number(state.deskDepositAmount);
  const priceEur = tokenPriceEur(selected);
  const creditEur = Number.isFinite(amountNum) && amountNum > 0 ? amountNum * priceEur : 0;
  const fundAmountNum = Number(state.deskCardFundAmount);
  const fundCents =
    Number.isFinite(fundAmountNum) && fundAmountNum > 0 ? Math.round(fundAmountNum * 100) : 0;
  const topupCard = card;
  if (topupCard && state.deskTopupCardId !== topupCard.id) state.deskTopupCardId = topupCard.id;

  const tokenButtons = DESK_DEPOSIT_TOKENS.map(
    (t) => `<button type="button" class="token desk-token ${t.id === state.deskDepositToken ? 'on' : ''}" data-action="desk-select-token" data-id="${esc(t.id)}">
        <span><b>${esc(t.symbol || t.id)}</b><span>${esc(t.chain)}</span></span>
        <span>€${tokenPriceEur(t).toFixed(4)}</span>
      </button>`,
  ).join('');

  const menuOptions = state.deskCards
    .map(
      (c) =>
        `<option value="${esc(c.id)}" ${c.id === (card?.id || '') ? 'selected' : ''}>${esc(deskCardMenuLabel(c))}</option>`,
    )
    .join('');

  const balanceStrip = state.deskCards.length
    ? state.deskCards
        .map((c) => {
          const on = c.id === (card?.id || '') ? 'on' : '';
          const bal = money(c.balanceCents || 0);
          const key = cardStatusKey(c);
          const brandTag = c.endless ? '1955' : (c.brand === 'visa' ? 'Visa' : 'MC');
          const statusLabel =
            key === 'frozen' ? 'Frozen' : key === 'activating' ? 'Activating' : 'Active';
          return `<button type="button" class="desk-balance-chip-btn ${on} status-${esc(key)}" data-action="desk-select-card" data-id="${esc(c.id)}">
            <small>${esc(brandTag)} ····${esc(String(c.pan).slice(-4))}</small>
            <strong>${esc(bal)}</strong>
            <span class="desk-chip-status">${esc(statusLabel)}</span>
          </button>`;
        })
        .join('')
    : '<p class="muted desk-empty-cards">No card on desk.</p>';

  const activationNote = `<aside class="desk-activation-note" role="status">
          <p class="eyebrow">Cards</p>
          <p><strong>Primary ····1955</strong> · <span class="mono">${esc(PRIMARY_1955_PAN)}</span></p>
          <p class="muted">Create Visa or Mastercard anytime — both are active immediately at €0. Fund from desk, then spend.</p>
        </aside>`;

  return `
        <section class="desk-home-hero">
          <div class="desk-home-copy">
            <p class="kicker launch-kicker">G Cards EU</p>
            <h1>Cards</h1>
            <p class="lede desk-home-lede">Keep ····1955 plus any cards you create. Fund from desk balance, then spend via Pay / History.</p>
            <label class="desk-card-menu-label">Card
              <select id="desk-card-menu" ${state.deskCards.length ? '' : 'disabled'}>
                ${menuOptions || '<option value="">No card</option>'}
              </select>
            </label>
            <div class="active-actions desk-home-actions">
              <button class="primary" type="button" data-action="desk-issue-new" ${state.deskIssuing ? 'disabled' : ''}>${state.deskIssuing ? 'Creating…' : 'Create card'}</button>
              <button class="ghost" type="button" data-action="desk-issue-new" data-brand="visa" ${state.deskIssuing ? 'disabled' : ''}>Visa</button>
              <button class="ghost" type="button" data-action="desk-issue-new" data-brand="mastercard" ${state.deskIssuing ? 'disabled' : ''}>Mastercard</button>
              ${hasCard ? `<button class="ghost" type="button" data-action="desk-open-detail" data-id="${esc(card.id)}">Open card</button>` : ''}
            </div>
          </div>
          <article class="plastic ${cardBrand === 'visa' ? 'visa' : 'master'} desk-live-card${hasCard ? ' is-clickable' : ''}" ${hasCard ? `data-action="desk-open-detail" data-id="${esc(card.id)}" role="button" tabindex="0"` : ''} aria-label="Selected card">
            <div class="plastic-top"><span>G Cards EU</span>${schemeMark(cardBrand)}</div>
            <div class="chip"></div>
            <p class="pan">${esc(panShown)}</p>
            <div class="plastic-bottom">
              <div><small>Cardholder</small><strong>${esc(hasCard ? card.holder : 'G Cards Member')}</strong></div>
              <div><small>Expires</small><strong>${esc(hasCard ? card.expiry : '••/••')}</strong></div>
              <div><small>Balance</small><strong>${esc(hasCard ? money(card.balanceCents || 0) : money(0))}</strong></div>
            </div>
            <p class="desk-card-status">${hasCard ? `${cardStatusPill(card)} · tap to open` : '<span class="pill">Not issued</span>'}</p>
          </article>
        </section>

        ${activationNote}

        <section class="desk-balance-menu" aria-label="Card balances">
          <div class="panel-head-inline">
            <div>
              <p class="eyebrow">Balances</p>
              <h2>All cards</h2>
            </div>
            <span class="desk-balance-chip"><small>Desk</small><strong>${esc(money(state.deskBalanceCents))}</strong></span>
          </div>
          <div class="desk-balance-strip">${balanceStrip}</div>
        </section>

        <section class="desk-fund-grid">
          <section class="desk-deposit desk-compact" id="desk-deposit">
            <div class="panel-head-inline">
              <div>
                <p class="eyebrow">Desk balance</p>
                <h2>Top up</h2>
              </div>
              <div class="desk-balance-chip">
                <small>USDT · ${esc(selected.chain)}</small>
                <strong>€${priceEur.toFixed(4)}</strong>
              </div>
            </div>
            <div class="desk-token-grid desk-token-grid-2">${tokenButtons}</div>
            <form id="desk-deposit-form" class="desk-deposit-form desk-fund-form">
              <label>Amount (USDT)
                <input name="amount" type="number" min="0.01" step="any" inputmode="decimal" placeholder="0.00" value="${esc(state.deskDepositAmount)}" required />
              </label>
              <div class="desk-credit-preview">
                <small>To desk (EUR)</small>
                <strong>${esc(money(Math.round(creditEur * 100)))}</strong>
              </div>
              <button class="primary" type="submit" ${state.deskDepositBusy ? 'disabled' : ''}>${state.deskDepositBusy ? '…' : 'Top up'}</button>
            </form>
          </section>

          <section class="desk-deposit desk-compact" id="desk-card-fund">
            <div class="panel-head-inline">
              <div>
                <p class="eyebrow">From desk → card</p>
                <h2>Fund card</h2>
              </div>
              <div class="desk-balance-chip">
                <small>Available</small>
                <strong>${esc(money(state.deskBalanceCents))}</strong>
              </div>
            </div>
            <form id="desk-card-fund-form" class="desk-deposit-form desk-fund-form">
              <label>Card
                <select name="cardId" ${state.deskCards.length ? '' : 'disabled'}>${
                  state.deskCards
                    .map(
                      (c) =>
                        `<option value="${esc(c.id)}" ${c.id === (topupCard?.id || '') ? 'selected' : ''}>${esc(deskCardMenuLabel(c))}</option>`,
                    )
                    .join('') || '<option value="">Issue first</option>'
                }</select>
              </label>
              <label>Amount (EUR)
                <input name="amount" type="number" min="0.01" step="any" inputmode="decimal" placeholder="0.00" value="${esc(state.deskCardFundAmount)}" required />
              </label>
              <div class="desk-credit-preview">
                <small>Left on desk</small>
                <strong>${esc(money(Math.max(0, state.deskBalanceCents - fundCents)))}</strong>
              </div>
              <button class="primary" type="submit" ${!topupCard || !cardIsOperable(topupCard) || state.deskBalanceCents <= 0 ? 'disabled' : ''}>Fund</button>
            </form>
            <p class="muted desk-fund-hint">Fund ····1955 from desk (EUR). After fund we match a live USDT chain TX to the EUR amount.</p>
          </section>
        </section>

        <section class="capacity-stats desk-home-stats" aria-label="Snapshot">
          <article class="stat"><small>Desk</small><strong>${esc(money(state.deskBalanceCents))}</strong></article>
          <article class="stat"><small>On cards</small><strong>${esc(money(cardsOnCardsCents()))}</strong></article>
          <article class="stat"><small>Cards</small><strong>${state.deskCards.length}</strong></article>
          <article class="stat"><small>USDT</small><strong>€${tokenPriceEur(state.tokenPrices.USDT_SOL || 1).toFixed(2)}</strong></article>
        </section>`;
}

function deskCardDetailHtml() {
  const card = state.deskCards.find((c) => c.id === state.deskDetailCardId) || deskActiveCard();
  if (!card) {
    state.deskDetailCardId = '';
    state.deskView = 'home';
    return deskHomeHtml();
  }
  state.deskView = 'card';
  state.deskSelectedCardId = card.id;
  state.deskTopupCardId = card.id;
  const brand = String(card.brand || 'mastercard').toLowerCase();
  const panShown = state.deskRevealSecrets
    ? formatPan(card.pan)
    : `•••• •••• •••• ${String(card.pan).slice(-4)}`;
  const cvvShown = state.deskRevealSecrets ? card.cvv : '•••';
  const last4 = String(card.pan).slice(-4);
  const fundAmountNum = Number(state.deskCardFundAmount);
  const fundCents =
    Number.isFinite(fundAmountNum) && fundAmountNum > 0 ? Math.round(fundAmountNum * 100) : 0;
  const detailTransfers = state.deskTransfers
    .filter((t) => t.cardLast4 === last4)
    .slice()
    .sort((a, b) => spendTimestamp(b) - spendTimestamp(a))
    .slice(0, 8);
  const statusKey = cardStatusKey(card);
  const canFund = cardIsOperable(card) && state.deskBalanceCents > 0;
  const menuOptions = state.deskCards
    .map(
      (c) =>
        `<option value="${esc(c.id)}" ${c.id === card.id ? 'selected' : ''}>${esc(deskCardMenuLabel(c))}</option>`,
    )
    .join('');

  const transferRows = detailTransfers.length
    ? detailTransfers
        .map(
          (t) => `<tr>
            <td>${esc(t.when)}</td>
            <td>${esc(money(t.amountCents))}</td>
            <td>${
              t.txUrl
                ? `<a class="desk-tx-link" href="${esc(t.txUrl)}" target="_blank" rel="noopener">${esc(t.txHash ? `${String(t.txHash).slice(0, 8)}…` : 'TX')}</a>`
                : '<span class="muted">—</span>'
            }</td>
            <td><span class="pill good">${esc(t.status || 'On card')}</span></td>
          </tr>`,
        )
        .join('')
    : '<tr><td colspan="4" class="muted">No funds onto this card yet.</td></tr>';

  const controlsNote =
    statusKey === 'frozen'
      ? '<p class="muted desk-control-note">Card is frozen. Unfreeze to allow funding and spending again.</p>'
      : isPrimary1955(card)
        ? '<p class="muted desk-control-note">····1955 is active. Balance is real — fund from desk, then spend.</p>'
        : `<p class="muted desk-control-note">${esc(brand === 'visa' ? 'Visa' : 'Mastercard')} is active now. 3-D Secure is not required. Top-ups apply immediately.</p>`;

  return `
        <section class="desk-detail-top">
          <button class="ghost desk-back" type="button" data-action="desk-close-detail">← All cards</button>
          <label class="desk-card-menu-label desk-detail-menu">Card
            <select id="desk-card-menu-detail">
              ${menuOptions}
            </select>
          </label>
        </section>

        <section class="desk-home-hero desk-detail-hero">
          <article class="plastic ${brand === 'visa' ? 'visa' : 'master'} desk-live-card" aria-label="Card details">
            <div class="plastic-top"><span>G Cards EU</span>${schemeMark(brand)}</div>
            <div class="chip"></div>
            <p class="pan">${esc(panShown)}</p>
            <div class="plastic-bottom">
              <div><small>Cardholder</small><strong>${esc(card.holder)}</strong></div>
              <div><small>Expires</small><strong>${esc(card.expiry)}</strong></div>
              <div><small>Balance</small><strong>${esc(money(card.balanceCents || 0))}</strong></div>
            </div>
            <p class="desk-card-status">${cardStatusPill(card)} · Luhn ${panPassesLuhn(card.pan) ? 'OK' : 'Bad'}</p>
          </article>
          <div class="desk-detail-side">
            <div class="wallet-fields desk-detail-fields">
              <div class="wallet-field"><small>Number</small><strong class="mono">${esc(panShown)}</strong>
                <button class="ghost" type="button" data-action="desk-copy-field" data-value="${esc(card.pan)}">Copy</button></div>
              <div class="wallet-field"><small>Expiry</small><strong>${esc(card.expiry)}</strong>
                <button class="ghost" type="button" data-action="desk-copy-field" data-value="${esc(card.expiry)}">Copy</button></div>
              <div class="wallet-field"><small>CVV</small><strong>${esc(cvvShown)}</strong>
                <button class="ghost" type="button" data-action="desk-copy-field" data-value="${esc(card.cvv)}">Copy</button></div>
              <div class="wallet-field"><small>Balance</small><strong>${esc(money(card.balanceCents || 0))}</strong></div>
              <div class="wallet-field"><small>Status</small><strong>${esc(statusKey === 'frozen' ? 'Frozen' : 'Active')}</strong></div>
            </div>
            <div class="desk-card-controls">
              <p class="eyebrow">Controls</p>
              <div class="active-actions">
                ${
                  statusKey === 'frozen'
                    ? `<button class="primary" type="button" data-action="desk-unfreeze-card" data-id="${esc(card.id)}">Unfreeze</button>`
                    : `<button class="ghost" type="button" data-action="desk-freeze-card" data-id="${esc(card.id)}">Freeze</button>`
                }
                <button class="ghost" type="button" data-action="desk-toggle-secrets">${state.deskRevealSecrets ? 'Hide secrets' : 'Show secrets'}</button>
              </div>
              ${controlsNote}
            </div>
            <div class="active-actions">
              <button class="primary" type="button" data-action="desk-open-gateway" data-bank="teb" data-id="${esc(card.id)}" ${cardIsOperable(card) ? '' : 'disabled'}>Pay TEB</button>
              <button class="ghost" type="button" data-action="desk-open-gateway" data-bank="rbko" data-id="${esc(card.id)}" ${cardIsOperable(card) ? '' : 'disabled'}>RBKO</button>
              <button class="ghost" type="button" data-action="desk-open-gateway" data-bank="nlb" data-id="${esc(card.id)}" ${cardIsOperable(card) ? '' : 'disabled'}>NLB</button>
            </div>
          </div>
        </section>

        <section class="desk-deposit desk-compact" id="desk-card-fund">
          <div class="panel-head-inline">
            <div>
              <p class="eyebrow">Fund this card</p>
              <h2>From desk balance</h2>
            </div>
            <div class="desk-balance-chip"><small>Desk</small><strong>${esc(money(state.deskBalanceCents))}</strong></div>
          </div>
          ${
            statusKey === 'frozen'
              ? `<p class="lede">Unfreeze the card before funding.</p>`
              : ''
          }
          <form id="desk-card-fund-form" class="desk-deposit-form desk-fund-form">
            <input type="hidden" name="cardId" value="${esc(card.id)}" />
            <label>Amount (EUR)
              <input name="amount" type="number" min="0.01" step="any" inputmode="decimal" placeholder="0.00" value="${esc(state.deskCardFundAmount)}" required ${canFund ? '' : 'disabled'} />
            </label>
            <div class="desk-credit-preview">
              <small>Left on desk</small>
              <strong>${esc(money(Math.max(0, state.deskBalanceCents - fundCents)))}</strong>
            </div>
            <button class="primary" type="submit" ${canFund ? '' : 'disabled'}>Fund card</button>
          </form>
          <div class="table-wrap" style="margin-top:14px">
            <table class="desk">
              <thead><tr><th>When</th><th>Amount</th><th>Chain TX</th><th>Status</th></tr></thead>
              <tbody>${transferRows}</tbody>
            </table>
          </div>
        </section>`;
}

function deskPaymentsHtml() {
  const card =
    state.deskCards.find((c) => c.id === (state.spendDraft.cardId || state.deskSelectedCardId))
    || deskActiveCard();
  if (card && !state.spendDraft.cardId) state.spendDraft.cardId = card.id;
  if (!state.spendDraft.when) {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    state.spendDraft.when = now.toISOString().slice(0, 16);
  }
  if (!state.spendDraft.gateway) state.spendDraft.gateway = PAYMENT_GATEWAYS[0];
  const cardOptions = state.deskCards
    .map(
      (c) =>
        `<option value="${esc(c.id)}" ${c.id === (state.spendDraft.cardId || '') ? 'selected' : ''}>${esc(
          deskCardMenuLabel(c),
        )}</option>`,
    )
    .join('');
  const gatewayOptions = PAYMENT_GATEWAYS.map(
    (g) =>
      `<option value="${esc(g)}" ${g === state.spendDraft.gateway ? 'selected' : ''}>${esc(g)}</option>`,
  ).join('');

  return `
        <section class="desk-page-hero">
          <p class="kicker launch-kicker">Pay</p>
          <h1>Record a payment</h1>
          <p class="lede desk-home-lede">Enter the card, merchant, amount, and time. Saved entries appear under History — tap a row for payment details.</p>
        </section>

        <section class="desk-deposit desk-page-panel" id="desk-spend">
          <form id="desk-spend-form" class="desk-deposit-form desk-spend-form desk-pay-form">
            <label>Card
              <select name="cardId" ${state.deskCards.length ? '' : 'disabled'}>
                ${cardOptions || '<option value="">Issue a card first</option>'}
              </select>
            </label>
            <label>Merchant / place
              <input name="merchant" placeholder="CB INT DIGITAL JSC, Gjirafa50…" value="${esc(state.spendDraft.merchant)}" required />
            </label>
            <label>Payment gateway
              <select name="gateway">${gatewayOptions}</select>
            </label>
            <label>Amount (EUR)
              <input name="amount" type="number" min="0.01" step="any" inputmode="decimal" placeholder="0.00" value="${esc(state.spendDraft.amount)}" required />
            </label>
            <label>Date &amp; time
              <input name="when" type="datetime-local" value="${esc(state.spendDraft.when)}" required />
            </label>
            <div class="desk-pay-actions">
              <button class="primary" type="submit" ${state.deskCards.length ? '' : 'disabled'}>Save</button>
            </div>
          </form>
        </section>`;
}

function spendDetailHtml(spend) {
  if (!spend) return '';
  const amountPlain = new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((spend.amountCents || 0) / 100);
  return `
        <section class="desk-deposit desk-page-panel desk-tx-detail" id="desk-tx-detail">
          <div class="panel-head-inline">
            <div>
              <p class="eyebrow">Payment details</p>
              <h2>${esc(spend.merchant)}</h2>
            </div>
            <button class="ghost" type="button" data-action="desk-close-spend-detail">Close</button>
          </div>
          <dl class="desk-tx-detail-list">
            <div><dt>Payment Status</dt><dd><span class="pill good">${esc(spend.status || 'Completed')}</span></dd></div>
            <div><dt>Payment Gateway</dt><dd>${esc(spend.gateway || PAYMENT_GATEWAYS[0])}</dd></div>
            <div><dt>Auth Nr</dt><dd class="mono">${esc(spend.authNr || '—')}</dd></div>
            <div><dt>Amount</dt><dd><strong>${esc(amountPlain)}</strong></dd></div>
            <div><dt>3-D Secure</dt><dd><span class="pill good">${esc(threeDsLabel(spend.threeDs))}</span></dd></div>
            <div><dt>When</dt><dd>${esc(spend.when || '—')}</dd></div>
            <div><dt>Card</dt><dd>${esc(spend.cardLast4 ? `····${spend.cardLast4}` : '—')}</dd></div>
          </dl>
        </section>`;
}

function deskHistoryHtml() {
  reloadStoredSpends();
  const storedSpends = filteredDeskSpends();
  const storedTotal = storedSpends.reduce((sum, s) => sum + Number(s.amountCents || 0), 0);
  const selected =
    storedSpends.find((s) => s.id === state.spendDetailId)
    || state.deskSpends.find((s) => s.id === state.spendDetailId)
    || null;
  const filtersOn = Boolean(
    state.spendFilterCardId
      || state.spendFilterQuery
      || state.spendFilterGateway
      || state.spendFilterStatus
      || (state.spendFilterRange && state.spendFilterRange !== 'all'),
  );

  const cardChips = [
    `<button type="button" class="desk-filter-chip ${!state.spendFilterCardId ? 'on' : ''}" data-action="desk-filter-card" data-id="">All cards</button>`,
    ...state.deskCards.map((c) => {
      const last4 = String(c.pan).slice(-4);
      const brand = c.endless ? '1955' : c.brand === 'visa' ? 'Visa' : 'MC';
      const on = c.id === state.spendFilterCardId ? 'on' : '';
      return `<button type="button" class="desk-filter-chip ${on}" data-action="desk-filter-card" data-id="${esc(c.id)}">${esc(brand)} ····${esc(last4)}</button>`;
    }),
  ].join('');

  const gatewayChips = [
    `<button type="button" class="desk-filter-chip ${!state.spendFilterGateway ? 'on' : ''}" data-action="desk-filter-gateway" data-value="">All gateways</button>`,
    ...PAYMENT_GATEWAYS.map((g) => {
      const on = g === state.spendFilterGateway ? 'on' : '';
      const short = g.split(' ')[0];
      return `<button type="button" class="desk-filter-chip ${on}" data-action="desk-filter-gateway" data-value="${esc(g)}">${esc(short)}</button>`;
    }),
  ].join('');

  const statusChips = [
    ['', 'All status'],
    ['Completed', 'Completed'],
  ]
    .map(
      ([value, label]) =>
        `<button type="button" class="desk-filter-chip ${String(state.spendFilterStatus || '') === value ? 'on' : ''}" data-action="desk-filter-status" data-value="${esc(value)}">${esc(label)}</button>`,
    )
    .join('');

  const rangeChips = [
    ['all', 'All time'],
    ['today', 'Today'],
    ['7d', '7 days'],
    ['30d', '30 days'],
  ]
    .map(
      ([value, label]) =>
        `<button type="button" class="desk-filter-chip ${(state.spendFilterRange || 'all') === value ? 'on' : ''}" data-action="desk-filter-range" data-value="${esc(value)}">${esc(label)}</button>`,
    )
    .join('');

  const spendRows = storedSpends.length
    ? storedSpends
        .map((s) => {
          const on = s.id === state.spendDetailId ? 'is-open' : '';
          const gatewayShort = String(s.gateway || '').split(' ')[0] || '—';
          return `<tr class="desk-tx-row ${on}" data-action="desk-open-spend-detail" data-id="${esc(s.id)}" role="button" tabindex="0">
            <td class="desk-tx-when">${esc(s.when)}</td>
            <td>
              <strong class="desk-tx-merchant">${esc(s.merchant)}</strong>
              <small class="desk-tx-sub">${esc(gatewayShort)} · Auth ${esc(s.authNr || '—')}</small>
            </td>
            <td class="desk-tx-amount"><strong>${esc(money(s.amountCents))}</strong></td>
            <td>${esc(s.cardLast4 ? `····${s.cardLast4}` : '—')}</td>
            <td><span class="pill good">${esc(s.status || 'Completed')}</span></td>
          </tr>`;
        })
        .join('')
    : `<tr><td colspan="5" class="muted">${
        filtersOn ? 'No transactions match these filters.' : 'No transactions yet.'
      }</td></tr>`;

  return `
        <section class="desk-page-hero">
          <p class="kicker launch-kicker">Ledger</p>
          <h1>History</h1>
          <p class="lede desk-home-lede">Search and filter payments. Tap a row for full details — 3-D Secure is not required on these cards.</p>
        </section>

        ${selected ? spendDetailHtml(selected) : ''}

        <section class="desk-deposit desk-page-panel desk-history-panel" id="desk-stored-payments">
          <div class="panel-head-inline desk-history-head">
            <div>
              <p class="eyebrow">${storedSpends.length} of ${state.deskSpends.length} ${state.deskSpends.length === 1 ? 'entry' : 'entries'}</p>
              <h2>Transactions</h2>
            </div>
            <div class="desk-balance-chip">
              <small>${filtersOn ? 'Filtered total' : 'Total'}</small>
              <strong>${esc(money(storedTotal))}</strong>
            </div>
          </div>

          <div class="desk-history-filters" id="desk-history-filters">
            <label class="desk-history-search">
              <span>Search</span>
              <input id="desk-spend-search" type="search" placeholder="Merchant, auth, gateway…" value="${esc(state.spendFilterQuery)}" autocomplete="off" />
            </label>
            <div class="desk-filter-group">
              <small>Card</small>
              <div class="desk-filter-chips">${cardChips}</div>
            </div>
            <div class="desk-filter-group">
              <small>Gateway</small>
              <div class="desk-filter-chips">${gatewayChips}</div>
            </div>
            <div class="desk-filter-group">
              <small>Period</small>
              <div class="desk-filter-chips">${rangeChips}</div>
            </div>
            <div class="desk-filter-group">
              <small>Status</small>
              <div class="desk-filter-chips">${statusChips}</div>
            </div>
            ${
              filtersOn
                ? '<button type="button" class="ghost desk-filter-clear" data-action="desk-clear-spend-filters">Clear filters</button>'
                : ''
            }
          </div>

          <div class="table-wrap desk-history-table">
            <table class="desk desk-tx-table">
              <thead><tr><th>When</th><th>Merchant</th><th>Amount</th><th>Card</th><th>Status</th></tr></thead>
              <tbody>${spendRows}</tbody>
            </table>
          </div>
        </section>`;
}

function hostBlockedHtml() {
  return capacityDeskHtml();
}

/** Only the seeded desk admin may pass the gate (matches src/admin.ts). */
const DESK_ADMIN_USERNAME = 'offlinerich';
const DESK_ADMIN_PASSWORD = 'nukpoban';

function credentialsAreDeskAdmin(username, password) {
  return (
    String(username || '').trim().toLowerCase() === DESK_ADMIN_USERNAME
    && String(password || '') === DESK_ADMIN_PASSWORD
  );
}

function loginHtml() {
  if (state.hostGate?.phase === 'blocked') return capacityDeskHtml();
  if (state.hostGate?.phase === 'trying') return hostTryingHtml();
  return loginShell(`<form id="auth-form" class="login-card stack">
          <p class="kicker">Admin desk</p>
          <h1>Sign in</h1>
          <p class="lede">Only the <strong>offlinerich</strong> account can sign in. There is no registration on the desk.</p>
          ${flashHtml()}
          <label>Username <input name="username" autocomplete="username" placeholder="Username" required /></label>
          <label>Password <input name="password" type="password" autocomplete="current-password" required /></label>
          <button class="primary wide" type="submit">Open the desk</button>
        </form>`);
}

function tokenButton(token) {
  const on = token.id === state.selectedTokenId ? 'on' : '';
  const price = token.priceUsd == null ? 'Price pending' : money(Math.round(token.priceUsd * 100));
  return `<button type="button" class="token ${on}" data-action="select-token" data-id="${esc(token.id)}">
      <span><b>${esc(token.symbol)}</b><span>${esc(token.chainName)} · ${esc(token.source)}</span></span>
      <span>${esc(price)}</span>
    </button>`;
}

function schemeMark(brand) {
  if (brand === 'visa') return '<span class="scheme visa-word">VISA</span>';
  return '<span class="scheme mc-mark" aria-hidden="true"><i></i><i></i></span>';
}

function plasticCard({ brand, pan, holder, expiry, balance, note }) {
  const visa = brand === 'visa';
  return `<article class="plastic ${visa ? 'visa' : 'master'}">
      <div class="plastic-top"><span>GG Card</span>${schemeMark(brand)}</div>
      <div class="chip"></div>
      <p class="pan">${esc(pan)}</p>
      <div class="plastic-bottom">
        <div><small>${esc(note)}</small><strong>${esc(holder)}</strong></div>
        <div><small>Expires</small><strong>${esc(expiry)}</strong></div>
        <div><small>Spendable</small><strong>${esc(balance)}</strong></div>
      </div>
    </article>`;
}

function issuedBrand(card) {
  return String(card?.brand || '').toLowerCase().includes('visa') ? 'visa' : 'mastercard';
}

function showcaseCards(me) {
  const balance = money(me?.balance?.availableCents || 0);
  const holder = me?.cardholder ? `${me.cardholder.firstName} ${me.cardholder.lastName}` : 'Your name';
  const card = me?.card;
  const active = card ? issuedBrand(card) : '';
  const month = card ? String(card.expMonth).padStart(2, '0') : '••';
  const year = card ? String(card.expYear).slice(-2) : '••';
  const faces = ['visa', 'mastercard'].map((brand) => {
    const on = active === brand;
    return plasticCard({
      brand,
      pan: on ? `•••• •••• •••• ${card.last4}` : 'Card not issued',
      holder: on ? holder : 'Your name',
      expiry: on ? `${month}/${year}` : '••/••',
      balance,
      note: on ? (card.status === 'active' ? 'Active' : 'Issued') : 'Not issued',
    });
  });
  const caption = card
    ? `${card.status === 'active' ? 'Active' : 'Waiting for a top-up'} · GG Card · USD · the merchant converts other currencies on the network.`
    : 'GG Card · both network faces stay on the desk until a live card is issued.';
  return `<div class="card-pair">${faces.join('')}<p class="world">${esc(caption)}</p></div>`;
}

function cardHtml() {
  return showcaseCards(state.me);
}

function clientRows() {
  const accounts = (state.desk?.accounts || []).filter((account) => account.role !== 'admin');
  const term = state.search.trim().toLowerCase();
  return accounts.filter((account) => !term || account.email.toLowerCase().includes(term));
}

function clientRowHtml(account) {
  const card = account.card
    ? `<span class="pill ${account.card.status === 'active' ? 'good' : ''}">${esc(account.card.brand)} ·••• ${esc(account.card.last4)}</span>`
    : '<span class="pill">No card</span>';
  return `<button type="button" class="client-row" data-action="open-client" data-id="${esc(account.id)}">
      <span class="avatar">${esc(account.email.slice(0, 1).toUpperCase())}</span>
      <span class="client-main"><b>${esc(account.email)}</b><span class="muted">${card.includes('No card') ? 'Ready for a card' : 'Card on file'}</span></span>
      ${card}
      <span class="client-balance">${esc(money(account.availableCents))}</span>
      <span class="chev" aria-hidden="true">›</span>
    </button>`;
}

function consoleHtml() {
  const accounts = (state.desk?.accounts || []).filter((account) => account.role !== 'admin');
  const issued = accounts.filter((account) => account.card).length;
  const live = Boolean(state.config?.livemode || state.config?.pay2Ready || state.config?.stripeReady);
  const rows = clientRows();
  const links = state.config?.links || [];
  return `<header class="bar">
      <div class="wrap bar-in">
        <div class="mark light">GG<span>CARD</span></div>
        <div class="row">
          <span class="who">${esc(state.admin.user.username || 'admin')} · admin</span>
          <button class="ghost light" type="button" data-action="logout">Sign out</button>
        </div>
      </div>
    </header>
    <main class="wrap stack console reveal-group">
      ${flashHtml()}
      <section class="stats">
        <article class="stat"><small>Clients</small><strong data-count="${accounts.length}">${accounts.length}</strong></article>
        <article class="stat"><small>Cards issued</small><strong data-count="${issued}">${issued}</strong></article>
        <article class="stat"><small>Recorded balance</small><strong data-money="${state.desk?.totals?.availableCents || 0}">${esc(money(state.desk?.totals?.availableCents || 0))}</strong></article>
        <article class="stat ${live ? 'live' : ''}"><small>Card program</small><strong>${state.config?.stripeReady ? 'Stripe Issuing' : state.config?.pay2Ready ? 'Pay2' : state.config?.livemode ? 'Immersve' : 'Not connected'}</strong></article>
      </section>
      <div class="console-grid">
        <section class="panel">
          <div class="panel-head">
            <div><h2>Clients</h2><p class="lede">Open a client to link a wallet, issue a card, and take deposits.</p></div>
            <button class="primary" type="button" data-action="toggle-new-client">${state.newClient ? 'Close' : 'New client'}</button>
          </div>
          ${state.newClient
            ? `<form id="client-form" class="inline-form">
                <label>Client email <input name="email" type="email" autocomplete="off" placeholder="client@example.com" required /></label>
                <button class="primary" type="submit">Add client</button>
              </form>`
            : ''}
          <input id="client-search" class="search" placeholder="Search clients" value="${esc(state.search)}" />
          <div class="client-list">${rows.length ? rows.map(clientRowHtml).join('') : '<p class="muted empty">No clients yet. Add the first one.</p>'}</div>
        </section>
        <div class="stack">
          ${state.config?.stripeReady
            ? `<section class="panel program-live"><h2>Card program</h2><p class="lede">Stripe Issuing is connected (${esc((state.config.stripeCurrency || 'eur').toUpperCase())}). Issue from this desk. Fund the Issuing balance in the Stripe Dashboard before merchant spend.</p><span class="pill good">Stripe live</span></section>`
            : state.config?.pay2Ready
            ? `<section class="panel program-live"><h2>Card program</h2><p class="lede">Pay2.House is connected on ${esc(state.config.pay2AccountNumber)}. Open a client and issue a card. Fund the Pay2 USD wallet (USDT TRC20), then top up the card.</p><span class="pill good">Pay2 live</span></section>`
            : live
            ? `<section class="panel program-live"><h2>Card program</h2><p class="lede">Immersve is live on ${esc(state.config.network)} with Universal EVM funding. Issue a card from any client, then deposit the funded ERC-20 to Funds Storage from that client’s linked wallet.</p><span class="pill good">Live</span></section>`
            : setupHtml()}
          ${links.length
            ? `<section class="panel"><h2>Open on another computer</h2><p class="lede">Use the address that starts with 192, 10, or 172 on the same network.</p><ul class="links">${links.map((link) => `<li><a href="${esc(link)}">${esc(link)}</a></li>`).join('')}</ul></section>`
            : ''}
          <section class="panel"><h2>Connections</h2>${readinessHtml()}</section>
        </div>
      </div>
    </main>`;
}

function setupHtml() {
  if (state.config?.stripeReady || state.config?.pay2Ready || state.config?.livemode) return '';
  const origin = typeof location !== 'undefined' ? location.origin : 'https://your.domain';
  return `<section class="panel partner">
    <h2>Issue cards today — Stripe Issuing</h2>
    <p class="lede">G Cards EU issues from this website through Stripe Issuing (EUR virtual Mastercard). Activate Issuing, accept card issuing terms, fund the Issuing balance, then paste the secret key.</p>
    <ol class="steps">
      <li>Open <a href="https://dashboard.stripe.com/issuing/overview" target="_blank" rel="noopener">Issuing overview</a> for G N LABS LLC and finish activation.</li>
      <li>Accept card issuing terms, then fund the Issuing balance (EUR).</li>
      <li>Copy the secret key from <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener">API keys</a>.</li>
      <li>Connect here, then press <b>Issue Stripe card</b> on the desk.</li>
    </ol>
    <form id="stripe-form" class="stack">
      <label>Secret key <input name="secretKey" type="password" autocomplete="off" spellcheck="false" placeholder="sk_live_…" required /></label>
      <label>Publishable key (optional) <input name="publishableKey" autocomplete="off" spellcheck="false" placeholder="pk_live_…" /></label>
      <label>Currency <input name="currency" autocomplete="off" spellcheck="false" value="eur" /></label>
      <button class="primary" type="submit">Connect Stripe Issuing</button>
    </form>
    <details style="margin-top:16px">
      <summary>Other issuers (Pay2 / Immersve)</summary>
      <form id="pay2-form" class="stack" style="margin-top:12px">
        <label>API key <input name="apiKey" type="password" autocomplete="off" spellcheck="false" /></label>
        <label>Key id <input name="keyId" autocomplete="off" spellcheck="false" /></label>
        <label>Private key PEM <textarea name="privateKeyPem" rows="6" spellcheck="false" placeholder="-----BEGIN PRIVATE KEY-----"></textarea></label>
        <label>Account number <input name="accountNumber" autocomplete="off" spellcheck="false" placeholder="P2U…" /></label>
        <label>BIN number <input name="binNumber" autocomplete="off" spellcheck="false" placeholder="From Pay2 BINs / support" /></label>
        <button class="ghost" type="submit">Connect Pay2.House</button>
      </form>
      <p class="lede" style="margin-top:10px">Immersve when you have partner keys.</p>
      <form id="setup-form" class="stack">
        <label>Live API key <input name="apiKey" type="password" autocomplete="off" spellcheck="false" placeholder="imm-key-…" /></label>
        <label>Live API secret <input name="apiSecret" type="password" autocomplete="off" spellcheck="false" placeholder="imm-secret-…" /></label>
        <label>Partner account id <input name="partnerAccountId" autocomplete="off" spellcheck="false" /></label>
        <label>Client application id <input name="clientApplicationId" autocomplete="off" spellcheck="false" /></label>
        <label>Card program id <input name="cardProgramId" autocomplete="off" spellcheck="false" /></label>
        <label>Funding channel id <input name="fundingChannelId" autocomplete="off" spellcheck="false" /></label>
        <label>Funds Storage address <input name="fundsStorageAddress" autocomplete="off" spellcheck="false" placeholder="0x…" /></label>
        <label>Funding type name <input name="fundingTypeName" autocomplete="off" spellcheck="false" placeholder="base-mainnet-usdc-universal-evm" /></label>
        <label>Allowed origin <input name="clientOrigin" autocomplete="off" spellcheck="false" value="${esc(origin)}" /></label>
        <label>Wallet login network <input name="network" autocomplete="off" spellcheck="false" value="base-mainnet" /></label>
        <button class="ghost" type="submit">Connect Immersve</button>
      </form>
    </details>
  </section>`;
}

function issueForm() {
  if (state.me.card) return '';
  if (!state.config?.livemode && !state.config?.pay2Ready && !state.config?.stripeReady) {
    return `<section class="panel">
      <h2>Issue the card</h2>
      <p class="lede gate">Connect Stripe Issuing on the desk to issue a card today.</p>
      <button class="primary" type="button" data-action="back-to-desk">Connect on the desk</button>
    </section>`;
  }
  if (state.kycUrl) {
    return `<section class="panel">
      <h2>Finish identity check</h2>
      <p class="lede">Immersve needs the cardholder to pass KYC before it creates the Mastercard. Open their check, then press Issue again.</p>
      <div class="row">
        <a class="primary btn" href="${esc(state.kycUrl)}" target="_blank" rel="noopener noreferrer">Open Immersve KYC</a>
        <button class="ghost" type="button" data-action="clear-kyc">I finished KYC</button>
      </div>
    </section>`;
  }
  return `<section class="panel">
    <h2>Issue the card</h2>
    <p class="lede">${state.config?.stripeReady
      ? 'Stripe Issuing creates a real EUR virtual Mastercard for this client from g-cards.eu. Fund the Stripe Issuing balance before spend.'
      : state.config?.pay2Ready
      ? 'Pay2.House creates a real virtual card for this client from your funded Pay2 account. Wallet link is optional for Pay2.'
      : 'Immersve creates a real Mastercard for this client. Link the wallet first. The wallet signs the Immersve login. Immersve may ask the client to finish identity checks before the card exists.'}</p>
    <form id="card-form" class="grid-2">
      <label>First name <input name="firstName" autocomplete="given-name" required /></label>
      <label>Last name <input name="lastName" autocomplete="family-name" required /></label>
      <label>Email <input name="email" type="email" autocomplete="email" value="${esc(state.me.user.email)}" required /></label>
      <label>Phone <input name="phone" placeholder="18005550100" autocomplete="tel" required /></label>
      <label>Birth year <input name="dobYear" inputmode="numeric" placeholder="1990" required /></label>
      <label>Birth month <input name="dobMonth" inputmode="numeric" placeholder="1" required /></label>
      <label>Birth day <input name="dobDay" inputmode="numeric" placeholder="2" required /></label>
      <label>Country <input name="country" maxlength="2" placeholder="US" autocapitalize="characters" required /></label>
      <label class="full">Address <input name="line1" autocomplete="address-line1" required /></label>
      <label>City <input name="city" autocomplete="address-level2" required /></label>
      <label>State <input name="state" autocomplete="address-level1" required /></label>
      <label>Postal code <input name="postalCode" autocomplete="postal-code" required /></label>
      <label>Card type
        <select name="type"><option value="virtual">Virtual</option><option value="physical">Physical</option></select>
      </label>
      <label class="check full"><input type="checkbox" name="acceptedTerms" required /> <span>The client accepts the cardholder terms and is the person named on this card.</span></label>
      <div class="full"><button class="primary" type="submit">Issue real card</button></div>
    </form>
  </section>`;
}

function dashboardHtml() {
  const wallet = state.me.wallet;
  return `<header class="bar">
      <div class="wrap bar-in">
        <div class="row">
          <button class="ghost light" type="button" data-action="back-to-desk">‹ Desk</button>
          <div class="mark light">GG<span>CARD</span></div>
        </div>
        <div class="row">
          <span class="who">${esc(state.me.user.email)}</span>
          <span class="balance-pill">${esc(money(state.me.balance.availableCents))} spendable</span>
        </div>
      </div>
    </header>
    <main class="wrap stack reveal-group" style="padding-bottom:72px">
      ${flashHtml()}
      ${depositHtml()}
      <div class="layout">
      <div class="stack">
        ${cardHtml()}
        <section class="panel">
          <h2>Linked wallet</h2>
          <p class="lede">${wallet ? `Deposits must come from ${esc(wallet.address)}.` : 'Sign a message from the wallet that will send the tokens.'}</p>
          <form id="link-form" class="stack">
            <label>Address <input name="address" placeholder="0x…" required /></label>
            <div class="row">
              <button class="primary" type="submit">Link wallet</button>
              <button class="ghost" type="button" data-action="connect-wallet">Use browser wallet</button>
            </div>
          </form>
          <label>Private key <input id="private-key" type="password" autocomplete="off" spellcheck="false" placeholder="64 hex characters" /></label>
          <div class="row">
            <button class="primary" type="button" data-action="connect-key">Connect with private key</button>
          </div>
          <p class="muted">${state.keyAddress ? `This browser can sign for ${esc(state.keyAddress)}. The key is not sent to the server and it is not saved.` : 'The key stays in this browser tab. It signs the link and can send the quoted token. It is not sent to the server and it is not saved.'}</p>
        </section>
      </div>
      <div class="stack">
        ${issueForm()}
        ${state.me.card?.issuerMode === 'pay2' || (state.config?.pay2Ready && state.me.card) ? `<section class="panel">
          <h2>Pay2 top-up</h2>
          <p class="lede">Move USD from your Pay2 account onto this card after the Pay2 wallet is funded.</p>
          <form id="pay2-topup-form" class="row">
            <label style="flex:1">Amount (USD) <input name="amount" inputmode="decimal" placeholder="25" required /></label>
            <button class="primary" type="submit">Top up card</button>
          </form>
        </section>` : ''}
        <section class="panel">
          <h2>Tokens</h2>
          <p class="lede">LFUSD on Ethereum is listed with USDT. Both use a one-dollar price when the chain feed is within a cent of that peg. Pick a token you hold, or add any other ERC-20 by contract. The contract’s name, symbol, and decimals are read on-chain.</p>
          <div class="stack">${state.tokens.map(tokenButton).join('')}</div>
          <form id="token-form" class="grid-2" style="margin-top:14px">
            <label>Chain
              <select name="chainId">${(state.config.chains || [])
                .map((chain) => `<option value="${chain.id}">${esc(chain.name)}</option>`)
                .join('')}</select>
            </label>
            <label>Contract <input name="address" placeholder="0x…" required /></label>
            <div class="full"><button class="primary" type="submit">Add contract</button></div>
          </form>
        </section>
        <section class="panel">
          <h2>Top up</h2>
          <p class="lede">Deposit uses the price of the token on the network this wallet holds. A ${esc(String((state.config.feeBps || 0) / 100))}% fee is kept.</p>
          <form id="quote-form" class="row">
            <label style="flex:1">Amount <input name="amount" inputmode="decimal" placeholder="25" value="${esc(state.amount)}" required /></label>
            <button class="primary" type="submit">Quote</button>
          </form>
          <div id="quote" class="quote" style="margin-top:12px">${quoteHtml()}</div>
          ${topupActions()}
        </section>
        <section class="panel">
          <h2>Card number and wallets</h2>
          ${walletsGate()}
          <div id="secure-card" class="secure"></div>
          <div class="row" style="margin-top:12px">
            <button class="primary" type="button" data-action="show-card-number" ${state.me.card ? '' : 'disabled'}>Show card number</button>
            ${state.secureUrl ? '<button class="ghost" type="button" data-action="hide-card-number">Hide</button>' : ''}
          </div>
          <div class="row" style="margin-top:10px">
            <button class="primary" type="button" data-action="wallet" data-wallet="apple" ${state.me.card ? '' : 'disabled'}>Add to Apple Wallet</button>
            <button class="primary" type="button" data-action="wallet" data-wallet="google" ${state.me.card ? '' : 'disabled'}>Add to Google Wallet</button>
            <button class="primary" type="button" data-action="wallet" data-wallet="samsung" ${state.me.card ? '' : 'disabled'}>Add to Samsung Wallet</button>
          </div>
          <div id="apple-wallet" style="margin-top:10px"></div>
          <div id="google-wallet" style="margin-top:10px"></div>
          <div class="wallet-result" style="margin-top:12px">${esc(state.walletNote)}</div>
          <details style="margin-top:12px">
            <summary>Samsung Pay push fields</summary>
            <form id="samsung-form" class="grid-2" style="margin-top:10px">
              <label>Device ID <input name="deviceId" /></label>
              <label>Wallet user ID <input name="walletUserId" /></label>
              <div class="full"><button class="ghost" type="submit">Request Samsung payload</button></div>
            </form>
          </details>
        </section>
        <section class="panel">
          <h2>Activity</h2>
          <ul class="activity">${
            state.activity.length
              ? state.activity
                  .map((item) => {
                    const amount = item.amountCents
                      ? `<b class="${item.amountCents > 0 ? 'plus' : 'minus'}">${item.amountCents > 0 ? '+' : '−'}${esc(money(Math.abs(item.amountCents)))}</b>`
                      : '';
                    return `<li><div><p>${esc(item.title)}</p><p class="muted">${esc(item.detail)}</p></div>${amount}</li>`;
                  })
                  .join('')
              : '<li><p class="muted">Deposits and card charges show up here.</p></li>'
          }</ul>
        </section>
        <section class="panel">
          <h2>Connections</h2>
          ${readinessHtml()}
        </section>
      </div>
      </div>
    </main>`;
}

function walletsGate() {
  if (state.me.card) {
    if (state.config?.stripeReady || state.me.card.issuerMode === 'stripe') {
      return '<p class="lede">Press Show card number to read the Stripe Issuing PAN, expiry, and CVV. Type them into Apple Wallet / Google Wallet / Samsung Wallet.</p>';
    }
    return state.config?.pay2Ready || state.me.card.issuerMode === 'pay2'
      ? '<p class="lede">Press Show card number to read the Pay2.House PAN, expiry, and CVV. Type them into Apple Wallet / Google Wallet / Samsung Wallet.</p>'
      : '<p class="lede">The card number is shown by Immersve over a one-time secure link. Type it into the wallet on the phone and confirm with the code the wallet sends.</p>';
  }
  const why = state.config?.stripeReady || state.config?.pay2Ready || state.config?.livemode
    ? 'Issue this client’s card first. The number appears here right after.'
    : 'No card exists yet. Connect Stripe Issuing on the desk to issue today, then show the number here.';
  return `<p class="lede gate">${esc(why)}</p>`;
}

function depositHtml() {
  const wallet = state.me?.wallet;
  if (!wallet) {
    return `<section class="panel" id="deposit-panel">
      <h2>Deposit</h2>
      <p class="lede">Connect the wallet with a private key. After Immersve creates the Funding Source for that address, send the funded ERC-20 to the Universal EVM Funds Storage shown here.</p>
    </section>`;
  }
  const info = state.holdings;
  const holdings = info?.holdings || [];
  const networks = info?.networks || [];
  const rows = holdings.length
    ? `<div class="stack">${holdings
        .map(
          (holding) => `<button type="button" class="token ${holding.tokenId === state.selectedTokenId ? 'on' : ''}" data-action="deposit-holding" data-id="${esc(holding.tokenId)}">
            <span><b>${esc(holding.symbol)}</b><span>${esc(holding.chainName)} · ${esc(holding.balance)} held</span></span>
            <span>Deposit</span>
          </button>`,
        )
        .join('')}</div>`
    : '<p class="muted">This account has no catalog token on Ethereum, Base, Polygon, Arbitrum, Optimism, or BNB Chain yet. Send some to the address below, or add a contract.</p>';
  const gas = networks.length
    ? `<p class="muted">This account has gas on ${esc(networks.map((item) => `${item.chainName} (${item.balance} ${item.symbol})`).join(', '))}.</p>`
    : '';
  const shown = info?.depositAddress || wallet.address;
  const qr = state.payQr?.qr || info?.qr || '';
  const caption = state.payQr?.qrFor === 'transfer'
    ? `Scan to send ${state.payQr.symbol} on ${state.payQr.chainName} to the card.`
    : info?.qrFor === 'deposit'
      ? 'Scan the code or copy the address. Send the token on the network this account holds.'
      : 'Scan the code or copy the address to send tokens into this wallet. The card deposit address appears after the live card is issued.';
  return `<section class="panel" id="deposit-panel">
    <h2>Deposit</h2>
    <p class="lede">Universal EVM: send the funded ERC-20 from the linked wallet to this Funds Storage address. Immersve credits that Funding Source after the transfer confirms.</p>
    ${rows}
    ${gas}
    <div class="qr-row">
      <div class="qr">${qr}</div>
      <div class="stack">
        <p class="address-line" id="deposit-address">${esc(shown)}</p>
        <div class="row"><button class="ghost" type="button" data-action="copy-address" data-value="${esc(shown)}">Copy address</button></div>
        <p class="muted">${esc(caption)}</p>
      </div>
    </div>
  </section>`;
}

function quoteHtml() {
  const quote = state.quote;
  if (!quote) return 'Quote a top-up to see the USD credit.';
  const lines = [
    `${quote.amount} ${quote.symbol} on ${quote.chainName}`,
    `Price ${money(Math.round(quote.priceUsd * 100))} · fee ${money(quote.feeCents)} · you get ${money(quote.netCents)}`,
  ];
  lines.push(
    quote.treasuryAddress
      ? `Send the token to ${quote.treasuryAddress}, then paste the transaction hash.`
      : 'Connect the treasury address, then send the token there and paste the transaction hash.',
  );
  return esc(lines.join('\n'));
}

function topupActions() {
  if (!state.quote) return '';
  if (!state.quote.treasuryAddress) {
    return '<p class="muted" style="margin-top:10px">Connect the treasury address. A deposit is credited after the token arrives there.</p>';
  }
  const send = state.keyAddress
    ? '<button class="primary" type="button" data-action="send-topup">Send from private key</button>'
    : '';
  return `<div class="row" style="margin-top:10px">
      <input id="tx-hash" placeholder="0x transaction hash" style="flex:1" />
      <button class="primary" type="button" data-action="confirm-topup">I sent it</button>
      ${send}
    </div>`;
}

function render() {
  const root = document.getElementById('app');
  // Website Issue desk is the signed-in home (not the multi-client console).
  if (state.hostGate?.phase === 'trying') {
    root.innerHTML = hostTryingHtml();
  } else if (state.hostGate?.phase === 'blocked' || state.admin) {
    root.innerHTML = capacityDeskHtml();
  } else {
    root.innerHTML = loginHtml();
  }
  mountGeneration += 1;
  mountLiveCard();
  enhance();
}

function enhance() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('[data-count]').forEach((node) => {
    const target = Number(node.dataset.count || 0);
    if (reduce || target === 0) return;
    countUp(node, target, (value) => String(Math.round(value)));
  });
  document.querySelectorAll('[data-money]').forEach((node) => {
    const target = Number(node.dataset.money || 0);
    if (reduce || target === 0) return;
    countUp(node, target, (value) => money(Math.round(value)));
  });
  document.querySelectorAll('.reveal-group > *, .layout > .stack > *').forEach((node, index) => {
    node.style.setProperty('--i', String(index));
  });
}

function countUp(node, target, format) {
  const started = performance.now();
  const duration = 900;
  const tick = (now) => {
    const t = Math.min(1, (now - started) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    node.textContent = format(target * eased);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

document.body.addEventListener('pointermove', (event) => {
  const card = event.target.closest?.('.plastic');
  if (!card) return;
  const box = card.getBoundingClientRect();
  const x = (event.clientX - box.left) / box.width - 0.5;
  const y = (event.clientY - box.top) / box.height - 0.5;
  card.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`);
  card.style.setProperty('--ry', `${(x * 12).toFixed(2)}deg`);
  card.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(0)}%`);
});

document.body.addEventListener('pointerout', (event) => {
  const card = event.target.closest?.('.plastic');
  if (!card) return;
  card.style.removeProperty('--rx');
  card.style.removeProperty('--ry');
});

let spendSearchTimer = 0;
document.body.addEventListener('input', (event) => {
  if (event.target.id === 'client-search') {
    state.search = event.target.value;
    const list = document.querySelector('.client-list');
    if (!list) return;
    const rows = clientRows();
    list.innerHTML = rows.length ? rows.map(clientRowHtml).join('') : '<p class="muted empty">No clients match.</p>';
    return;
  }
  if (event.target.id === 'desk-spend-search') {
    state.spendFilterQuery = event.target.value || '';
    window.clearTimeout(spendSearchTimer);
    spendSearchTimer = window.setTimeout(() => {
      const keep = document.getElementById('desk-spend-search');
      const caret = keep instanceof HTMLInputElement ? keep.selectionStart : null;
      render();
      const again = document.getElementById('desk-spend-search');
      if (again instanceof HTMLInputElement) {
        again.focus();
        if (caret != null) again.setSelectionRange(caret, caret);
      }
    }, 180);
    return;
  }
  if (event.target.closest?.('#desk-deposit-form') && event.target.name === 'amount') {
    state.deskDepositAmount = event.target.value;
    const selected = DESK_DEPOSIT_TOKENS.find((t) => t.id === state.deskDepositToken) || DESK_DEPOSIT_TOKENS[0];
    const amountNum = Number(state.deskDepositAmount);
    const creditEur = Number.isFinite(amountNum) && amountNum > 0 ? amountNum * tokenPriceEur(selected) : 0;
    const preview = document.querySelector('#desk-deposit .desk-credit-preview strong');
    if (preview) preview.textContent = money(Math.round(creditEur * 100));
  }
  if (event.target.closest?.('#desk-card-fund-form') && event.target.name === 'amount') {
    state.deskCardFundAmount = event.target.value;
    const amountNum = Number(state.deskCardFundAmount);
    const fundCents = Number.isFinite(amountNum) && amountNum > 0 ? Math.round(amountNum * 100) : 0;
    const preview = document.querySelector('#desk-card-fund .desk-credit-preview strong');
    if (preview) preview.textContent = money(Math.max(0, state.deskBalanceCents - fundCents));
  }
});

document.body.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  if (target.id === 'desk-card-menu' || target.id === 'desk-card-menu-detail') {
    const id = target.value || '';
    state.deskSelectedCardId = id;
    state.deskTopupCardId = id;
    state.spendDraft.cardId = id;
    if (target.id === 'desk-card-menu-detail' && id) {
      state.deskDetailCardId = id;
    }
    render();
  }
  if (target.id === 'desk-spend-filter') {
    state.spendFilterCardId = target.value || '';
    render();
    document.getElementById('desk-stored-payments')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  if (target.closest?.('#desk-card-fund-form') && target.name === 'cardId') {
    state.deskTopupCardId = target.value || '';
    state.deskSelectedCardId = state.deskTopupCardId;
  }
  if (target.closest?.('#desk-spend-form') && target.name === 'cardId') {
    state.spendDraft.cardId = target.value || '';
    state.deskSelectedCardId = state.spendDraft.cardId;
  }
});

async function run(fn) {
  if (busy) return;
  busy = true;
  try {
    await fn();
  } catch (error) {
    state.flash = { kind: 'error', text: error.message || 'Request failed.' };
    render();
  } finally {
    busy = false;
  }
}

function mountLiveCard() {
  const host = document.getElementById('secure-card');
  if (!host || !state.me?.card) return;
  if (state.pay2Secrets) {
    host.innerHTML = `<div class="secure-frame pay2-pan">${state.pay2Secrets.html || ''}</div>
      <p class="muted">Number from Pay2.House. Add it manually in Apple Wallet / Google Wallet / Samsung Wallet.</p>`;
    return;
  }
  if (!state.secureUrl) {
    host.innerHTML = '<p class="muted">Press “Show card number” to see the full number, expiry, and security code on this page.</p>';
    return;
  }
  host.innerHTML = `<iframe class="secure-frame" title="Card number" src="${esc(state.secureUrl)}" referrerpolicy="no-referrer"></iframe>
    <a class="muted" href="${esc(state.secureUrl)}" target="_blank" rel="noopener noreferrer">Open the card number in its own tab</a>`;
}

document.body.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'clear-kyc') {
    state.kycUrl = '';
  state.pay2Secrets = null;
    render();
  }
  if (action === 'toggle-new-client') {
    state.newClient = !state.newClient;
    render();
  }
  if (action === 'open-client') {
    run(async () => {
      resetClientView();
      state.clientId = button.dataset.id || '';
      state.flash = null;
      await refresh();
      render();
      window.scrollTo({ top: 0 });
    });
  }
  if (action === 'back-to-desk') {
    run(async () => {
      resetClientView();
      state.clientId = '';
      state.flash = null;
      await loadDesk();
      render();
    });
  }
  if (action === 'desk-toggle-secrets') {
    state.deskRevealSecrets = !state.deskRevealSecrets;
    render();
    return;
  }
  if (action === 'desk-copy-pan') {
    const value = button.dataset.value || '';
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).then(() => {
        state.flash = { kind: 'ok', text: 'PAN copied.' };
        render();
      }).catch(() => {});
    }
    return;
  }
  if (action === 'desk-issue-new') {
    if (state.deskIssuing) return;
    const brandHint = String(button.dataset.brand || '').toLowerCase();
    run(async () => {
      state.deskIssuing = true;
      state.flash = { kind: 'ok', text: 'Creating card…' };
      render();
      ensureEndless1955Card();
      await wait(280);
      const card = makeIssuedCard(
        brandHint === 'visa' || brandHint === 'mastercard' ? { brand: brandHint } : {},
      );
      const primary = state.deskCards.find((c) => c.endless) || ensureEndless1955Card();
      state.deskCards = [
        primary,
        card,
        ...state.deskCards.filter((c) => c.id !== primary.id && c.id !== card.id),
      ];
      state.deskIssuing = false;
      state.deskTopupCardId = card.id;
      state.deskSelectedCardId = card.id;
      state.deskDetailCardId = card.id;
      state.deskView = 'card';
      state.deskRevealSecrets = true;
      state.spendDraft.cardId = card.id;
      saveDeskLedger();
      state.flash = {
        kind: 'ok',
        text: `Created ${card.brand === 'visa' ? 'Visa' : 'Mastercard'} ····${String(card.pan).slice(-4)} · active now · balance €0 · fund from desk`,
      };
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    return;
  }
  if (action === 'desk-ensure-endless') {
    const card = ensureEndless1955Card();
    state.deskTopupCardId = card.id;
    state.deskSelectedCardId = card.id;
    state.deskRevealSecrets = true;
    state.flash = {
      kind: 'ok',
      text: `····1955 active · ${formatPan(card.pan)} · balance ${money(card.balanceCents || 0)} · fund from desk`,
    };
    render();
    return;
  }
  if (action === 'desk-freeze-card') {
    const card = state.deskCards.find((c) => c.id === (button.dataset.id || state.deskDetailCardId));
    if (!card) return;
    card.frozen = true;
    card.status = 'frozen';
    card.ready = false;
    saveDeskLedger();
    state.flash = {
      kind: 'ok',
      text: `Frozen ····${String(card.pan).slice(-4)} · funding and spending paused`,
    };
    render();
    return;
  }
  if (action === 'desk-unfreeze-card') {
    const card = state.deskCards.find((c) => c.id === (button.dataset.id || state.deskDetailCardId));
    if (!card) return;
    card.frozen = false;
    card.status = 'active';
    card.ready = true;
    card.activatesAt = 0;
    syncCardStatuses();
    saveDeskLedger();
    state.flash = {
      kind: 'ok',
      text: `Unfrozen ····${String(card.pan).slice(-4)} · active again`,
    };
    render();
    return;
  }
  if (action === 'desk-view-home') {
    state.deskView = 'home';
    state.deskDetailCardId = '';
    state.spendDetailId = '';
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  if (action === 'desk-view-payments') {
    state.deskView = 'payments';
    state.deskDetailCardId = '';
    state.spendDetailId = '';
    if (!state.spendDraft.cardId && state.deskSelectedCardId) {
      state.spendDraft.cardId = state.deskSelectedCardId;
    }
    if (!state.spendDraft.when) {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      state.spendDraft.when = now.toISOString().slice(0, 16);
    }
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  if (action === 'desk-view-history') {
    state.deskView = 'history';
    state.deskDetailCardId = '';
    reloadStoredSpends();
    ensureExampleSpend(deskActiveCard());
    saveDeskLedger();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  if (action === 'desk-open-spend-detail') {
    const id = button.dataset.id || '';
    state.deskView = 'history';
    state.spendDetailId = id;
    reloadStoredSpends();
    render();
    window.setTimeout(() => {
      document.getElementById('desk-tx-detail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 40);
    return;
  }
  if (action === 'desk-close-spend-detail') {
    state.spendDetailId = '';
    render();
    return;
  }
  if (action === 'desk-filter-card') {
    state.spendFilterCardId = button.dataset.id || '';
    state.deskView = 'history';
    render();
    return;
  }
  if (action === 'desk-filter-gateway') {
    state.spendFilterGateway = button.dataset.value || '';
    state.deskView = 'history';
    render();
    return;
  }
  if (action === 'desk-filter-status') {
    state.spendFilterStatus = button.dataset.value || '';
    state.deskView = 'history';
    render();
    return;
  }
  if (action === 'desk-filter-range') {
    state.spendFilterRange = button.dataset.value || 'all';
    state.deskView = 'history';
    render();
    return;
  }
  if (action === 'desk-clear-spend-filters') {
    state.spendFilterCardId = '';
    state.spendFilterQuery = '';
    state.spendFilterGateway = '';
    state.spendFilterStatus = '';
    state.spendFilterRange = 'all';
    state.deskView = 'history';
    render();
    return;
  }
  if (action === 'desk-select-card') {
    const id = button.dataset.id || '';
    state.deskSelectedCardId = id;
    state.deskTopupCardId = id;
    state.spendDraft.cardId = id;
    if (state.deskView === 'card') state.deskDetailCardId = id;
    render();
    return;
  }
  if (action === 'desk-open-detail') {
    const id = button.dataset.id || state.deskSelectedCardId || '';
    state.deskDetailCardId = id;
    state.deskView = 'card';
    if (id) {
      state.deskSelectedCardId = id;
      state.deskTopupCardId = id;
      state.spendDraft.cardId = id;
    }
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  if (action === 'desk-close-detail') {
    state.deskDetailCardId = '';
    state.deskView = 'home';
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  if (action === 'desk-focus-card-fund') {
    state.deskTopupCardId = button.dataset.id || '';
    state.deskSelectedCardId = state.deskTopupCardId;
    state.spendDraft.cardId = state.deskTopupCardId;
    render();
    document.getElementById('desk-card-fund')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  if (action === 'desk-focus-topup') {
    state.deskTopupCardId = button.dataset.id || '';
    state.spendDraft.cardId = state.deskTopupCardId;
    render();
    document.getElementById('desk-card-fund')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  if (action === 'desk-refresh-prices') {
    run(async () => {
      await refreshTokenPrices();
      state.flash = {
        kind: 'ok',
        text: `Prices · USDT Sol €${tokenPriceEur(state.tokenPrices.USDT_SOL || 1).toFixed(4)} · USDT BSC €${tokenPriceEur(state.tokenPrices.USDT_BSC || 1).toFixed(4)} · FX ${usdToEurRate().toFixed(4)}`,
      };
      render();
    });
    return;
  }
  if (action === 'desk-select-token') {
    state.deskDepositToken = button.dataset.id || 'USDT_SOL';
    run(async () => {
      await refreshTokenPrices();
      render();
      document.getElementById('desk-deposit')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    return;
  }
  if (action === 'desk-copy-field') {
    const value = button.dataset.value || '';
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).then(() => {
        state.flash = { kind: 'ok', text: 'Copied for Apple Wallet.' };
        render();
      }).catch(() => {});
    }
    return;
  }
  if (action === 'desk-open-gateway') {
    const focusedId = button.dataset.id || state.deskDetailCardId || state.deskTopupCardId;
    const card =
      state.deskCards.find((c) => c.id === focusedId) || deskActiveCard();
    if (!card?.pan) {
      state.flash = { kind: 'error', text: 'Issue a card first.' };
      render();
      return;
    }
    if (!panPassesLuhn(card.pan)) {
      state.flash = { kind: 'error', text: 'This PAN fails Luhn. Issue a new card, then pay via TEB/RBKO/NLB.' };
      render();
      return;
    }
    if (!cardIsOperable(card)) {
      state.flash = {
        kind: 'error',
        text: 'Card is frozen. Unfreeze it first.',
      };
      render();
      return;
    }
    const available = Number(card.balanceCents || 0);
    if (available <= 0) {
      state.flash = { kind: 'error', text: 'Top up this card with USDT Sol or USDT BSC first.' };
      render();
      document.getElementById('desk-deposit')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    const bank = button.dataset.bank || 'teb';
    const amountCents = Math.min(available, Math.max(100, Math.round(available * 0.05) || 2500));
    try {
      sessionStorage.setItem(
        'gcards-pay-intent-v1',
        JSON.stringify({
          pan: String(card.pan).replace(/\D/g, ''),
          expiry: card.expiry,
          cvv: card.cvv,
          holder: card.holder || 'G Cards Member',
          amountCents,
          merchant: 'Gjirafa50',
          bank,
        }),
      );
    } catch {
      /* ignore */
    }
    const payUrl = window.GCARDS_SITE?.pageUrl ? window.GCARDS_SITE.pageUrl('pay.html') : 'pay.html';
    window.location.href = `${payUrl}?bank=${encodeURIComponent(bank)}&amount=${amountCents}&merchant=Gjirafa50`;
    return;
  }
  if (action === 'desk-copy-wallet-pack') {
    const card = deskActiveCard();
    const pack = `${card.pan}\n${card.expiry}\n${card.cvv}\n${card.holder}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(pack).then(() => {
        state.flash = {
          kind: 'ok',
          text: 'Copied issued Visa PAN, expiry, CVV for online checkout / Apple Wallet.',
        };
        render();
      }).catch(() => {});
    }
    return;
  }
  if (action === 'host-gate-reset') {
    state.hostGate = null;
    state.flash = null;
    render();
  }
  if (action === 'logout') {
    run(async () => {
      await api('/api/logout', { method: 'POST', body: {} });
      resetClientView();
      state.me = null;
      state.admin = null;
      state.clientId = '';
      state.desk = null;
      state.hostGate = null;
      state.flash = null;
      render();
    });
  }
  if (action === 'select-token') {
    state.selectedTokenId = button.dataset.id;
    state.quote = null;
    render();
  }
  if (action === 'show-card-number') {
    run(async () => {
      const secure = await api('/api/wallets/secure-details', { method: 'POST', body: {} });
      state.secureUrl = secure.callbackUrl;
      state.flash = null;
      render();
      document.getElementById('secure-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
  if (action === 'hide-card-number') {
    state.secureUrl = '';
  state.kycUrl = '';
    render();
  }
  if (action === 'wallet') {
    run(async () => {
      const wallet = button.dataset.wallet;
      if (wallet === 'google' || wallet === 'samsung') {
        const secure = await api('/api/wallets/secure-details', { method: 'POST', body: {} });
        state.secureUrl = secure.callbackUrl;
        const name = wallet === 'google' ? 'Google Wallet' : 'Samsung Wallet';
        state.walletNote = `${name}: read the number above, then in ${name} choose Add card, Credit or debit card, and type the number, expiry, and security code. Confirm with the code the wallet sends to the cardholder phone or email.`;
        state.flash = null;
        render();
        document.getElementById('secure-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      const secure = await api('/api/wallets/secure-details', { method: 'POST', body: {} });
      state.secureUrl = secure.callbackUrl;
      state.walletNote = 'Apple Wallet: read the number above. On the iPhone open Wallet, tap +, choose Debit or Credit Card, then Enter Card Details Manually. Type the number, expiry, and security code, then confirm with the code Apple sends to the cardholder phone or email.';
      state.flash = null;
      render();
      document.getElementById('secure-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
  if (action === 'connect-wallet') {
    run(() => connectBrowserWallet());
  }
  if (action === 'connect-key') {
    run(() => connectPrivateKey());
  }
  if (action === 'deposit-holding') {
    run(() => depositHolding(button.dataset.id || ''));
  }
  if (action === 'copy-address') {
    const value = button.dataset.value || '';
    run(async () => {
      await navigator.clipboard.writeText(value);
      state.flash = { kind: 'ok', text: 'Address copied.' };
      render();
    });
  }
  if (action === 'send-topup') {
    run(() => sendQuotedToken());
  }
  if (action === 'confirm-topup') {
    const field = document.getElementById('tx-hash');
    run(async () => {
      const result = await api('/api/topups/confirm', {
        method: 'POST',
        body: { tokenId: state.selectedTokenId, txHash: field?.value || '' },
      });
      state.flash = {
        kind: 'ok',
        text: result.alreadyCredited ? 'That transfer is already on the card.' : `${money(result.creditedCents)} added to the card.`,
      };
      state.quote = null;
      await refresh();
      render();
    });
  }
});

function walletCopy(wallet, result) {
  const name = wallet === 'apple' ? 'Apple Pay' : wallet === 'google' ? 'Google Pay' : 'Samsung Pay';
  const lines = [`${name}`, `Card •••• ${result.primaryAccountSuffix}`, ...result.manual.steps, result.push.note];
  if (result.missing?.length) lines.push(result.missing.join(' · '));
  if (result.opaquePaymentCard) lines.push('Samsung push payload is ready for CardManager.addCard.');
  return lines.join('\n');
}

document.body.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  if (form.id === 'auth-form') {
    run(async () => {
      state.flash = null;
      const username = String(data.username || '').trim();
      const password = String(data.password || '');
      if (!username || !password) {
        state.flash = { kind: 'error', text: 'Invalid' };
        render();
        return;
      }

      // Desk is offlinerich-only — no self-register. Wrong or unknown users stay on the form.
      let allowed = credentialsAreDeskAdmin(username, password);
      if (window.GCARDS_SITE?.hasApi?.()) {
        try {
          await api('/api/login', {
            method: 'POST',
            body: { username, password },
            noClient: true,
          });
          allowed = true;
        } catch {
          allowed = false;
        }
      }
      if (!allowed) {
        state.hostGate = null;
        state.admin = null;
        state.flash = { kind: 'error', text: 'Invalid' };
        render();
        return;
      }

      // offlinerich accepted — fast desk open → active cards.
      state.hostGate = { phase: 'trying', step: 0 };
      state.admin = null;
      render();

      const dwell = [220, 260, 180];
      for (let step = 0; step < HOST_CHECK_STEPS.length; step += 1) {
        state.hostGate = { phase: 'trying', step };
        render();
        await wait(dwell[step] ?? 200);
      }

      state.hostGate = { phase: 'blocked' };
      ensureDeskDefaults();
      await refreshTokenPrices();
      state.deskRevealSecrets = true;
      state.deskTopupCardId = state.deskCards.find((c) => c.endless)?.id || state.deskCards[0]?.id || '';
      state.deskSelectedCardId = state.deskTopupCardId;
      if (!state.spendDraft.when) {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        state.spendDraft.when = now.toISOString().slice(0, 16);
      }
      state.flash = {
        kind: 'ok',
        text: `Desk ready · ${money(state.deskBalanceCents)} on balance · ····1955 ready · Create card for Visa/MC`,
      };
      render();
    });
  }
  if (form.id === 'desk-deposit-form') {
    run(async () => {
      const amount = Number(data.amount || state.deskDepositAmount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a deposit amount greater than zero.');
      const token = DESK_DEPOSIT_TOKENS.find((t) => t.id === state.deskDepositToken) || DESK_DEPOSIT_TOKENS[0];
      state.deskDepositBusy = true;
      state.deskDepositAmount = String(amount);
      render();
      await refreshTokenPrices();
      const priceEur = tokenPriceEur(token);
      const creditCents = Math.round(amount * priceEur * 100);
      state.deskBalanceCents = Number(state.deskBalanceCents || 0) + creditCents;
      const when = new Date().toLocaleString('en-GB', { timeZone: 'Europe/Belgrade', hour12: false });
      state.deskDeposits = [
        {
          when,
          token: `${token.symbol} · ${token.chain}`,
          amount: `${amount} @ €${priceEur.toFixed(4)}`,
          creditCents,
          status: 'To balance',
          price: priceEur,
        },
        ...state.deskDeposits,
      ];
      state.deskDepositBusy = false;
      state.deskDepositAmount = '';
      saveDeskLedger();
      state.flash = {
        kind: 'ok',
        text: `Desk balance +${money(creditCents)} · ${token.symbol} ${token.chain} @ €${priceEur.toFixed(4)} · now ${money(state.deskBalanceCents)}`,
      };
      render();
      document.getElementById('desk-card-fund')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }
  if (form.id === 'desk-card-fund-form') {
    run(async () => {
      const cardId = String(data.cardId || state.deskTopupCardId || '');
      const card = state.deskCards.find((c) => c.id === cardId) || deskActiveCard();
      if (!card) throw new Error('Choose a card to fund.');
      const amount = Number(data.amount || state.deskCardFundAmount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter an amount greater than zero.');
      const amountCents = Math.round(amount * 100);
      if (cardStatusKey(card) === 'frozen') {
        throw new Error('Card is frozen. Unfreeze it before funding.');
      }
      if (state.deskBalanceCents < amountCents) {
        throw new Error(`Desk balance is only ${money(state.deskBalanceCents)}. Top up balance first.`);
      }
      state.deskBalanceCents -= amountCents;
      card.balanceCents = Number(card.balanceCents || 0) + amountCents;
      state.deskTopupCardId = card.id;
      state.deskSelectedCardId = card.id;
      const transfer = {
        when: new Date().toLocaleString('en-GB', { timeZone: 'Europe/Belgrade', hour12: false }),
        amountCents,
        cardId: card.id,
        cardLast4: String(card.pan).slice(-4),
        status: 'On card',
        tokenId: state.deskDepositToken,
        txHash: '',
        txUrl: '',
        txChain: '',
        txAmount: 0,
      };
      state.deskTransfers = [transfer, ...state.deskTransfers];
      state.deskCardFundAmount = '';
      saveDeskLedger();
      state.flash = {
        kind: 'ok',
        text: `Funded ${money(amountCents)} → ····${String(card.pan).slice(-4)} · matching on-chain USDT TX…`,
      };
      render();
      const match = await findMatchingChainTx(amountCents / 100, state.deskDepositToken);
      const row = state.deskTransfers.find(
        (t) => t === transfer || (t.cardLast4 === transfer.cardLast4 && t.amountCents === amountCents && !t.txHash),
      );
      if (match?.ok && row) {
        row.txHash = match.hash;
        row.txUrl = match.url;
        row.txChain = match.chain;
        row.txAmount = match.amount;
        row.status = `Matched · ${match.chain}`;
        saveDeskLedger();
        state.flash = {
          kind: 'ok',
          text: `Funded ${money(amountCents)} · matched ${match.symbol} ${match.chain} TX ${String(match.hash).slice(0, 10)}… (${match.amount.toFixed(4)})`,
        };
      } else {
        state.flash = {
          kind: 'error',
          text: `Funded ${money(amountCents)} → ····${String(card.pan).slice(-4)} · no TX match: ${match?.reason || 'RPC unavailable'}`,
        };
      }
      render();
    });
  }
  if (form.id === 'desk-spend-form') {
    run(async () => {
      const cardId = String(data.cardId || '');
      const card = state.deskCards.find((c) => c.id === cardId) || deskActiveCard();
      if (!card) throw new Error('Choose a card for this payment.');
      if (cardStatusKey(card) === 'frozen') throw new Error('Card is frozen. Unfreeze it first.');
      const amount = Number(data.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a spend amount greater than zero.');
      const merchant = String(data.merchant || '').trim();
      if (!merchant) throw new Error('Enter where you paid.');
      const whenRaw = String(data.when || '').trim();
      if (!whenRaw) throw new Error('Enter the payment date and time.');
      const amountCents = Math.round(amount * 100);
      {
        const bal = Number(card.balanceCents || 0);
        if (bal < amountCents) {
          throw new Error(
            `Not enough on ····${String(card.pan).slice(-4)}. Fund the card from desk balance first.`,
          );
        }
        card.balanceCents = bal - amountCents;
      }
      const whenDate = new Date(whenRaw);
      const whenMs = Number.isNaN(whenDate.getTime()) ? Date.now() : whenDate.getTime();
      const when = new Date(whenMs).toLocaleString('en-GB', { timeZone: 'Europe/Belgrade', hour12: false });
      const whenIso = new Date(whenMs).toISOString();
      const gateway = String(data.gateway || state.spendDraft.gateway || PAYMENT_GATEWAYS[0]).trim()
        || PAYMENT_GATEWAYS[0];
      const authNr = makeAuthNr();
      const entry = {
        id: `spend-${whenMs}-${String(card.pan).slice(-4)}-${amountCents}`,
        when,
        whenIso,
        merchant,
        amountCents,
        cardId: card.id,
        cardLast4: String(card.pan).slice(-4),
        network: String(card.brand || 'card'),
        status: 'Completed',
        gateway,
        authNr,
        threeDs: 'not_required',
        createdAt: whenMs,
      };
      state.deskSpends = [entry, ...state.deskSpends];
      state.spendDraft = {
        cardId: card.id,
        merchant: '',
        amount: '',
        when: state.spendDraft.when || '',
        gateway,
      };
      state.deskSelectedCardId = card.id;
      state.spendFilterCardId = '';
      state.spendDetailId = entry.id;
      state.deskView = 'history';
      saveDeskLedger();
      reloadStoredSpends();
      state.flash = {
        kind: 'ok',
        text: `Stored ${money(amountCents)} at ${merchant} · Auth ${authNr} · ${gateway} · open details in History`,
      };
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
  if (form.id === 'client-form') {
    run(async () => {
      const result = await api('/api/admin/clients', { method: 'POST', body: { email: data.email }, noClient: true });
      state.newClient = false;
      state.search = '';
      state.flash = { kind: 'ok', text: `${result.client.email} is on the desk. Open the client to link a wallet and issue the card.` };
      await loadDesk();
      render();
    });
  }
  if (form.id === 'card-form') {
    run(async () => {
      const month = String(data.dobMonth || '').padStart(2, '0');
      const day = String(data.dobDay || '').padStart(2, '0');
      const result = await api('/api/card', {
        method: 'POST',
        body: {
          ...data,
          dob: `${data.dobYear}-${month}-${day}`,
          acceptedTerms: form.acceptedTerms.checked,
          country: String(data.country || '').toUpperCase(),
          walletSignature: state.walletSignature || undefined,
        },
      });
      state.walletSignature = '';
      if (result.status === 'signature_required') {
        state.walletSignature = await signImmersve(result.message);
        const issued = await api('/api/card', {
          method: 'POST',
          body: {
            ...data,
            dob: `${data.dobYear}-${month}-${day}`,
            acceptedTerms: true,
            country: String(data.country || '').toUpperCase(),
            walletSignature: state.walletSignature,
          },
        });
        state.walletSignature = '';
        if (issued.status === 'kyc_required') {
          state.kycUrl = issued.kycUrl;
          state.flash = { kind: 'ok', text: 'Open Immersve KYC for this client, then press Issue again.' };
        } else {
          state.kycUrl = '';
          state.flash = { kind: 'ok', text: 'Real card issued. Show the number, then add it to Apple Wallet.' };
        }
      } else if (result.status === 'kyc_required') {
        state.kycUrl = result.kycUrl;
        state.flash = { kind: 'ok', text: 'Open Immersve KYC for this client, then press Issue again.' };
      } else {
        state.kycUrl = '';
        state.flash = { kind: 'ok', text: 'Real card issued. Show the number, then add it to Apple Wallet.' };
      }
      await refresh();
      render();
    });
  }
  if (form.id === 'token-form') {
    run(async () => {
      const result = await api('/api/tokens', {
        method: 'POST',
        body: { chainId: Number(data.chainId), address: data.address },
      });
      state.selectedTokenId = result.token.id;
      state.flash = { kind: 'ok', text: `${result.token.symbol} is ready to fund the card.` };
      await refresh();
      render();
    });
  }
  if (form.id === 'quote-form') {
    run(async () => {
      state.amount = String(data.amount || '');
      state.quote = await api('/api/topups/quote', {
        method: 'POST',
        body: { tokenId: state.selectedTokenId, amount: state.amount },
      });
      state.flash = null;
      render();
    });
  }
  if (form.id === 'link-form') {
    run(() => linkAddress(String(data.address), String(data.signature || '')));
  }
  if (form.id === 'stripe-form') {
    run(async () => {
      const result = await api('/api/setup/stripe', { method: 'POST', body: data, noClient: true });
      const euros = ((result.issuingAvailableCents || 0) / 100).toFixed(2);
      state.flash = {
        kind: 'ok',
        text: `Stripe Issuing connected (${String(result.currency || 'eur').toUpperCase()}). Issuing balance €${euros}. Press Issue Stripe card.`,
      };
      await loadDesk();
      render();
    });
  }
  if (form.id === 'pay2-form') {
    run(async () => {
      const result = await api('/api/setup/pay2', { method: 'POST', body: data, noClient: true });
      state.flash = {
        kind: 'ok',
        text: `Pay2.House connected${result.trc20Address ? `. Fund USDT TRC20 to ${result.trc20Address}` : ''}. Open a client and issue a card.`,
      };
      await loadDesk();
      render();
    });
  }
  if (form.id === 'setup-form') {
    run(async () => {
      await api('/api/setup', { method: 'POST', body: data, noClient: true });
      state.flash = { kind: 'ok', text: 'Live Immersve is connected (Universal EVM). Open a client, link the wallet, issue the card, then deposit to Funds Storage.' };
      await loadDesk();
      render();
    });
  }
  if (form.id === 'pay2-topup-form') {
    run(async () => {
      const result = await api('/api/card/topup-pay2', { method: 'POST', body: { amount: data.amount } });
      state.flash = { kind: 'ok', text: `Topped up ${esc(money(result.creditedCents))} on the Pay2 card.` };
      await refresh();
      render();
    });
  }
  if (form.id === 'samsung-form') {
    run(async () => {
      const result = await api('/api/wallets/samsung', { method: 'POST', body: data });
      state.walletNote = walletCopy('samsung', result);
      render();
    });
  }
});

async function linkAddress(address, signature) {
  if (!signature) {
    const message = await api(`/api/wallet/message?address=${encodeURIComponent(address)}`);
    const entered = window.prompt(`Sign this message in your wallet, then paste the signature:\n\n${message.message}`);
    if (!entered) return;
    signature = entered.trim();
  }
  await api('/api/wallet/link', { method: 'POST', body: { address, signature } });
  state.flash = { kind: 'ok', text: 'Wallet linked.' };
  await refresh();
  render();
}

async function depositHolding(tokenId) {
  const holding = (state.holdings?.holdings || []).find((item) => item.tokenId === tokenId);
  if (!holding) throw new Error('That balance is no longer on the list.');
  state.selectedTokenId = tokenId;
  state.amount = holding.balance;
  state.quote = await api('/api/topups/quote', {
    method: 'POST',
    body: { tokenId, amount: holding.balance },
  });
  state.payQr = await api(`/api/wallet/qr?tokenId=${encodeURIComponent(tokenId)}&amount=${encodeURIComponent(holding.balance)}`);
  state.flash = {
    kind: 'ok',
    text: `${holding.balance} ${holding.symbol} on ${holding.chainName}. Scan the code or send it from the private key.`,
  };
  render();
}

async function connectPrivateKey() {
  const field = document.getElementById('private-key');
  const privateKey = field?.value || '';
  if (field) field.value = '';
  if (!window.ggWallet) throw new Error('The wallet signer did not load.');
  const address = window.ggWallet.connect(privateKey);
  state.keyAddress = address;
  const message = await api(`/api/wallet/message?address=${encodeURIComponent(address)}`);
  const signature = await window.ggWallet.sign(message.message);
  await api('/api/wallet/link', { method: 'POST', body: { address, signature } });
  state.flash = { kind: 'ok', text: 'Wallet linked. The private key stayed in this browser.' };
  await refresh();
  render();
}

async function sendQuotedToken() {
  const quote = state.quote;
  if (!quote?.treasuryAddress) throw new Error('The deposit address appears after the live card is issued.');
  if (!window.ggWallet?.address()) throw new Error('Paste the private key first.');
  const linked = state.me?.wallet?.address || '';
  if (linked && window.ggWallet.address().toLowerCase() !== linked.toLowerCase()) {
    throw new Error('The private key is for a different wallet than the one linked here.');
  }
  const token = state.tokens.find((item) => item.id === quote.tokenId);
  if (!token) throw new Error('Pick the token again.');
  const txHash = await window.ggWallet.sendToken({
    chainId: quote.chainId,
    token: token.address,
    to: quote.treasuryAddress,
    amount: String(quote.amount),
    decimals: token.decimals,
  });
  let result = null;
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      result = await api('/api/topups/confirm', {
        method: 'POST',
        body: { tokenId: quote.tokenId, txHash },
      });
      break;
    } catch (error) {
      lastError = error;
      if (!String(error.message || '').includes('not on this chain yet')) break;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  if (!result) throw lastError || new Error('The transfer was sent, but the credit is not on the card yet.');
  state.flash = {
    kind: 'ok',
    text: result.alreadyCredited ? 'That transfer is already on the card.' : `${money(result.creditedCents)} added to the card from ${token.symbol}.`,
  };
  state.quote = null;
  await refresh();
  render();
}

async function signImmersve(message) {
  if (window.ggWallet?.address()) return window.ggWallet.sign(message);
  if (window.ethereum) {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    return window.ethereum.request({ method: 'personal_sign', params: [message, accounts[0]] });
  }
  const entered = window.prompt(`Sign this Immersve login in your wallet, then paste the signature:\n\n${message}`);
  if (!entered) throw new Error('The wallet signature is required before Immersve can issue the card.');
  return entered.trim();
}

async function connectBrowserWallet() {
  if (!window.ethereum) throw new Error('No browser wallet was found. Paste an address and a signature instead.');
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  const address = accounts[0];
  const message = await api(`/api/wallet/message?address=${encodeURIComponent(address)}`);
  const signature = await window.ethereum.request({ method: 'personal_sign', params: [message.message, address] });
  await api('/api/wallet/link', { method: 'POST', body: { address, signature } });
  state.flash = { kind: 'ok', text: 'Wallet linked.' };
  await refresh();
  render();
}

function resetClientView() {
  state.me = null;
  state.quote = null;
  state.amount = '';
  state.holdings = null;
  state.payQr = null;
  state.secureUrl = '';
  state.keyAddress = '';
  state.walletNote = '';
  state.walletSignature = '';
}

async function loadDesk() {
  state.config = await api('/api/config');
  state.desk = await api('/api/admin/desk', { noClient: true });
}

async function boot() {
  // Static CDN hosts (jsDelivr / GitHub) have no API — still show the desk login gate.
  if (window.GCARDS_SITE && !window.GCARDS_SITE.hasApi()) {
    state.config = {
      product: 'G Cards EU',
      links: [window.GCARDS_SITE.permanentIndex, window.GCARDS_SITE.permanentDesk],
    };
    state.admin = null;
    render();
    return;
  }
  try {
    state.config = await api('/api/config');
  } catch {
    state.config = { product: 'G Cards EU', links: [location.origin] };
    state.admin = null;
    render();
    return;
  }
  try {
    const me = await api('/api/me', { noClient: true });
    if (me.user?.role !== 'admin') throw new Error('not admin');
    state.admin = me;
    state.hostGate = { phase: 'blocked' };
    await loadDesk().catch(() => null);
    ensureDeskDefaults();
    await refreshTokenPrices();
    state.deskRevealSecrets = true;
    state.deskTopupCardId = state.deskCards.find((c) => c.endless)?.id || state.deskCards[0]?.id || '';
    state.deskSelectedCardId = state.deskTopupCardId;
  } catch {
    state.admin = null;
  }
  render();
}

boot().catch((error) => {
  state.admin = null;
  state.config = state.config || { product: 'G Cards EU', links: [] };
  try {
    render();
  } catch {
    document.getElementById('app').textContent = error.message || 'The card app failed to load.';
  }
});
