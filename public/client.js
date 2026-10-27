/** G Cards EU client account — login, dashboard, requests, notifications. */
(function () {
  const SESSION_KEY = 'gcards_eu_session_v3';
  const STORE_KEY = 'gcards_eu_store_v3';

  /** Platform-issued prepaid on this account (synced from desk / issuer). */
  const ISSUED_CLIENT = 'naserademi26@gmail.com';
  const ISSUED_PASS = 'nanajote';
  const PLATFORM_CARD = {
    id: 'O-01M5QSK63WPQS8RX8C3JEBTTJN',
    brand: 'visa',
    label: 'G Cards · Prepaid',
    last4: '9408',
    balance: 5,
    status: 'active',
    theme: 'teal',
    issuer: 'laso',
    holder: 'Naser Ademi',
    pan: '4343405855389408',
    expMonth: 4,
    expYear: 2027,
    cvv: '523',
    billing: '440 N Barranca Ave #4496, Covina, CA 91723',
    applePay: false,
  };

  function money(n) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  }

  function loadStore() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function saveStore(store) {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  }

  function syncIssuedAccount(store) {
    const email = ISSUED_CLIENT;
    if (!store.accounts) store.accounts = {};
    const existing = store.accounts[email] || {};
    const card = { ...PLATFORM_CARD };
    const hasCard = (existing.cards || []).some((c) => c.id === card.id);

    if (existing.password === ISSUED_PASS && hasCard && existing.platformCardSynced === 'laso-v1') {
      return store;
    }

    const otherCards = (existing.cards || []).filter((c) => c.id !== card.id && c.issuer !== 'demo');
    store.accounts[email] = {
      email,
      password: ISSUED_PASS,
      name: existing.name || 'Naser Ademi',
      createdAt: existing.createdAt || Date.now(),
      balance: 5,
      platformCardSynced: 'laso-v1',
      cards: [card, ...otherCards],
      transactions: [
        {
          id: 'tx_load',
          name: 'Card load',
          logo: 'G',
          tone: '#1a3a6e',
          amount: 5,
          last4: card.last4,
          at: Date.now() - 600_000,
        },
        ...(existing.transactions || []).filter((t) => t.id !== 'tx_load').slice(0, 8),
      ],
      requests: [
        {
          id: 'req_issued',
          type: 'Card issued',
          detail: 'G Cards Visa prepaid ···· 9408',
          status: 'Active',
          at: Date.now() - 600_000,
        },
      ],
      notifications: [
        {
          id: 'n_issued',
          text: 'Your Visa card ···· 9408 is active.',
          unread: true,
          at: Date.now() - 300_000,
        },
        ...(existing.notifications || []).filter((n) => n.id !== 'n_issued' && n.id !== 'n_laso').slice(0, 4),
      ],
      goals: existing.goals || [],
      income: existing.income || 5,
      spending: existing.spending || 0,
    };
    saveStore(store);
    return store;
  }

  function readSession() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function writeSession(session) {
    if (!session) sessionStorage.removeItem(SESSION_KEY);
    else sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function accountFor(email) {
    const store = syncIssuedAccount(loadStore());
    return store.accounts[String(email || '').toLowerCase()] || null;
  }

  function saveAccount(account) {
    const store = syncIssuedAccount(loadStore());
    store.accounts[account.email] = account;
    saveStore(store);
  }

  function fmtWhen(ts) {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(ts);
  }

  function brandMark(brand) {
    if (brand === 'visa') return '<span class="dash-scheme visa">VISA</span>';
    return '<span class="dash-scheme mc"><i></i><i></i></span>';
  }

  function cardFace(card) {
    const reveal = card.pan
      ? `<button type="button" class="dash-reveal" data-dash="reveal-card" data-id="${esc(card.id)}">Show details</button>`
      : '';
    const holder = card.holder || 'Cardholder';
    const exp =
      card.expMonth && card.expYear
        ? `${String(card.expMonth).padStart(2, '0')}/${String(card.expYear).slice(-2)}`
        : '—';
    return `<article class="dash-card ${esc(card.theme)} gcards-face" data-card-id="${esc(card.id)}">
      <div class="dash-card-sheen" aria-hidden="true"></div>
      <div class="dash-card-top">
        <span class="dash-card-brand">
          <img src="logo.svg" width="26" height="26" alt="" />
          <span>G Cards <em>EU</em></span>
        </span>
        ${brandMark(card.brand)}
      </div>
      <div class="dash-chip" aria-hidden="true"></div>
      <p class="dash-card-bal">${esc(money(card.balance))}</p>
      <p class="dash-card-pan">···· ···· ···· ${esc(card.last4)}</p>
      <div class="dash-card-bot">
        <span><small>Cardholder</small><b>${esc(holder)}</b></span>
        <span><small>Valid</small><b>${esc(exp)}</b></span>
        <span class="dash-contactless" aria-hidden="true"></span>
      </div>
      <span class="dash-card-status">${esc(card.status)}</span>
      ${reveal}
    </article>`;
  }

  function emptyBlock(message) {
    return `<p class="dash-empty">${esc(message)}</p>`;
  }

  function dashboardHtml(account) {
    const unread = (account.notifications || []).filter((n) => n.unread).length;
    const txs = account.transactions || [];
    const cards = account.cards || [];
    const goals = account.goals || [];
    const requests = account.requests || [];
    const notes = account.notifications || [];
    const balance = Number(account.balance) || cards.reduce((s, c) => s + (Number(c.balance) || 0), 0);

    return `<div class="dash" id="client-dashboard">
      <header class="dash-top">
        <div class="dash-brand">
          <img class="dash-logo-img" src="logo.svg" width="36" height="36" alt="" />
          <strong>G Cards <em>EU</em></strong>
        </div>
        <div class="dash-top-actions">
          <button type="button" class="dash-bell" data-dash="toggle-notes" aria-label="Notifications">
            Notifications${unread ? `<i>${unread}</i>` : ''}
          </button>
          <div class="dash-user">
            <span class="dash-avatar">${esc((account.name || account.email).slice(0, 1).toUpperCase())}</span>
            <div>
              <b>${esc(account.name || 'Client')}</b>
              <small>${esc(account.email)}</small>
            </div>
            <button type="button" class="dash-link" data-dash="logout">Sign out</button>
          </div>
        </div>
      </header>

      <div class="dash-notes" id="dash-notes" hidden>
        <p class="dash-notes-title">Notifications</p>
        ${
          notes
            .map(
              (n) => `<button type="button" class="dash-note ${n.unread ? 'unread' : ''}" data-dash="read-note" data-id="${esc(n.id)}">
              <span>${esc(n.text)}</span>
              <small>${esc(fmtWhen(n.at))}</small>
            </button>`,
            )
            .join('') || emptyBlock('No notifications yet.')
        }
      </div>

      <div class="dash-grid dash-grid-pro">
        <section class="dash-panel dash-balance-panel dash-span-2">
          <p class="dash-kicker">Available balance</p>
          <p class="dash-balance">${esc(money(balance))}</p>
          <p class="dash-platform-note">G Cards EU · cards issued to your account</p>
          <div class="dash-cards-row">
            ${
              cards.map(cardFace).join('') ||
              `<div class="dash-empty-card">${emptyBlock('No active cards yet. Submit a request below.')}</div>`
            }
            <button type="button" class="dash-add-card" data-dash="goto-request" aria-label="Request card">
              <span>+</span>
              <small>Request card</small>
            </button>
          </div>
          <div class="dash-secrets" id="dash-secrets" hidden></div>
        </section>

        <section class="dash-panel">
          <div class="dash-panel-head">
            <h2>Recent activity</h2>
          </div>
          <ul class="dash-tx">
            ${
              txs
                .slice(0, 6)
                .map(
                  (t) => `<li>
                  <span class="dash-tx-logo" style="background:${esc(t.tone || '#1a3a6e')}">${esc(t.logo || '·')}</span>
                  <div>
                    <b>${esc(t.name)}</b>
                    <small>${esc(fmtWhen(t.at))}</small>
                  </div>
                  <div class="dash-tx-right">
                    <b>${esc(money(t.amount))}</b>
                    <small>···· ${esc(t.last4 || '····')}</small>
                  </div>
                </li>`,
                )
                .join('') || `<li class="dash-empty">No transactions yet.</li>`
            }
          </ul>
        </section>

        <section class="dash-panel">
          <div class="dash-panel-head"><h2>Request tracking</h2></div>
          <ul class="dash-requests">
            ${
              requests
                .map(
                  (r) => `<li>
                  <div><b>${esc(r.type)}</b><small>${esc(r.detail)} · ${esc(fmtWhen(r.at))}</small></div>
                  <span class="dash-pill">${esc(r.status)}</span>
                </li>`,
                )
                .join('') || `<li class="dash-empty">No open requests.</li>`
            }
          </ul>
          <button type="button" class="dash-btn ghost" data-dash="goto-request">New card request</button>
        </section>

        <section class="dash-panel">
          <div class="dash-panel-head"><h2>Account summary</h2></div>
          <div class="dash-summary">
            <div>
              <p class="dash-kicker">Income</p>
              <p class="dash-mini-val up">${esc(money(account.income || 0))}</p>
            </div>
            <div>
              <p class="dash-kicker">Spending</p>
              <p class="dash-mini-val down">${esc(money(account.spending || 0))}</p>
            </div>
            <div>
              <p class="dash-kicker">Active cards</p>
              <p class="dash-mini-val">${esc(String(cards.filter((c) => c.status === 'active').length))}</p>
            </div>
          </div>
          ${
            goals.length
              ? `<ul class="dash-goals" style="margin-top:14px">${goals
                  .map((g) => {
                    const pct = Math.min(100, Math.round((g.saved / g.goal) * 100) || 0);
                    return `<li>
                      <div class="dash-goal-top"><b>${esc(g.name)}</b><span>${esc(money(g.goal))}</span></div>
                      <div class="dash-bar"><i style="width:${pct}%"></i></div>
                      <small>${esc(money(g.saved))} of ${esc(money(g.goal))}</small>
                    </li>`;
                  })
                  .join('')}</ul>`
              : ''
          }
        </section>
      </div>
    </div>`;
  }

  function setMarketingVisible(on) {
    document.body.classList.toggle('dash-open', !on);
    document
      .querySelectorAll('.client-site > .top, .client-site > main, .client-site > footer, .client-site > .drawer, .client-site > .page-bg')
      .forEach((el) => {
        el.hidden = !on;
      });
  }

  function mountDashboard(account) {
    let host = document.getElementById('client-app');
    if (!host) {
      host = document.createElement('div');
      host.id = 'client-app';
      document.body.appendChild(host);
    }
    setMarketingVisible(false);
    host.hidden = false;
    host.innerHTML = dashboardHtml(account);
    bindDashboard(account);
  }

  function unmountDashboard() {
    const host = document.getElementById('client-app');
    if (host) {
      host.hidden = true;
      host.innerHTML = '';
    }
    setMarketingVisible(true);
  }

  function bindDashboard(account) {
    const root = document.getElementById('client-dashboard');
    if (!root) return;
    root.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-dash]');
      if (!btn) return;
      const action = btn.getAttribute('data-dash');
      if (action === 'logout') {
        writeSession(null);
        unmountDashboard();
        paintMarketing();
        return;
      }
      if (action === 'toggle-notes') {
        const panel = document.getElementById('dash-notes');
        if (panel) panel.hidden = !panel.hidden;
        return;
      }
      if (action === 'read-note') {
        const id = btn.getAttribute('data-id');
        const next = accountFor(account.email);
        if (!next) return;
        next.notifications = (next.notifications || []).map((n) =>
          n.id === id ? { ...n, unread: false } : n,
        );
        saveAccount(next);
        mountDashboard(next);
        return;
      }
      if (action === 'goto-request') {
        unmountDashboard();
        setMarketingVisible(true);
        document.getElementById('order')?.scrollIntoView({ behavior: 'smooth' });
        paintMarketing();
        return;
      }
      if (action === 'reveal-card') {
        const id = btn.getAttribute('data-id');
        const card = (account.cards || []).find((c) => c.id === id);
        const box = document.getElementById('dash-secrets');
        if (!card?.pan || !box) return;
        const pan = String(card.pan).replace(/(\d{4})(?=\d)/g, '$1 ');
        box.hidden = false;
        box.innerHTML = `<p class="dash-kicker">Card details</p>
          <p><b>${esc(pan)}</b></p>
          <p>Exp ${esc(String(card.expMonth).padStart(2, '0'))}/${esc(String(card.expYear).slice(-2))} · CVV ${esc(card.cvv || '—')}</p>
          <small>${esc(card.billing || '')}</small>`;
      }
    });
  }

  const authFlash = document.getElementById('auth-flash');
  const orderFlash = document.getElementById('order-flash');
  const sessionLine = document.getElementById('session-line');
  const registerForm = document.getElementById('register-form');
  const signinForm = document.getElementById('signin-form');
  const orderForm = document.getElementById('order-form');
  const orderLock = document.getElementById('order-lock');
  const orderDone = document.getElementById('order-done');
  const orderDoneCopy = document.getElementById('order-done-copy');

  function showFlash(el, text, kind) {
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = '';
      el.className = 'portal-flash';
      return;
    }
    el.hidden = false;
    el.textContent = text;
    el.className = `portal-flash ${kind === 'ok' ? 'ok' : 'error'}`;
  }

  function selectTab(tab) {
    document.querySelectorAll('[data-tab]').forEach((b) => {
      const on = b.getAttribute('data-tab') === tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (registerForm) registerForm.hidden = tab !== 'register';
    if (signinForm) signinForm.hidden = tab !== 'signin';
    showFlash(authFlash, '');
  }

  function paintMarketing() {
    const session = readSession();
    const account = session?.email ? accountFor(session.email) : null;
    if (sessionLine) {
      if (account) {
        sessionLine.hidden = false;
        sessionLine.innerHTML = `Signed in as ${esc(account.email)} · <button type="button" class="portal-open-dash" data-open-dash>Open dashboard</button>`;
      } else {
        sessionLine.hidden = true;
        sessionLine.textContent = '';
      }
    }
    if (orderForm && orderLock) {
      if (account) {
        orderLock.hidden = true;
        orderForm.hidden = false;
      } else {
        orderLock.hidden = false;
        orderForm.hidden = true;
      }
    }
    if (orderDone && orderDoneCopy) {
      const latest = account?.requests?.[0];
      if (latest && account) {
        orderDone.hidden = false;
        orderDoneCopy.textContent = `${latest.detail} · ${latest.status}. Track progress in your dashboard.`;
      } else {
        orderDone.hidden = true;
      }
    }
  }

  function openDashboardIfSession() {
    const session = readSession();
    if (!session?.email) return false;
    const account = accountFor(session.email);
    if (!account) return false;
    mountDashboard(account);
    return true;
  }

  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => selectTab(btn.getAttribute('data-tab')));
  });

  document.querySelectorAll('[data-goto-signin]').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      selectTab('signin');
      document.getElementById('register')?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  registerForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(registerForm).entries());
    const email = String(data.email || '').trim().toLowerCase();
    const password = String(data.password || '');
    showFlash(authFlash, '');
    const store = syncIssuedAccount(loadStore());
    if (store.accounts[email] && store.accounts[email].password !== password) {
      showFlash(authFlash, 'An account with that email already exists. Sign in.', 'error');
      return;
    }
    if (!store.accounts[email]) {
      store.accounts[email] = {
        email,
        password,
        name: email.split('@')[0],
        createdAt: Date.now(),
        balance: 0,
        cards: [],
        transactions: [],
        requests: [],
        notifications: [
          {
            id: `n_${Date.now()}`,
            text: 'Welcome to G Cards EU. You can request a card from your account.',
            unread: true,
            at: Date.now(),
          },
        ],
        goals: [],
        income: 0,
        spending: 0,
      };
      saveStore(store);
    }
    writeSession({ email });
    showFlash(authFlash, 'Account created. Opening your dashboard…', 'ok');
    mountDashboard(accountFor(email));
  });

  signinForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(signinForm).entries());
    const email = String(data.email || '').trim().toLowerCase();
    const password = String(data.password || '');
    showFlash(authFlash, '');
    syncIssuedAccount(loadStore());
    const account = accountFor(email);
    if (!account || account.password !== password) {
      showFlash(authFlash, 'Invalid email or password.', 'error');
      return;
    }
    if (email === 'offlinerich@gg.card' || email === 'offlinerich') {
      showFlash(authFlash, 'Use the admin desk for that account.', 'error');
      return;
    }
    writeSession({ email });
    mountDashboard(account);
  });

  orderForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const session = readSession();
    const account = session?.email ? accountFor(session.email) : null;
    if (!account) {
      showFlash(orderFlash, 'Sign in first.', 'error');
      return;
    }
    const data = Object.fromEntries(new FormData(orderForm).entries());
    const brand = String(data.cardBrand || 'visa');
    const labels = { visa: 'Virtual Visa', mastercard: 'Virtual Mastercard', metal: 'Physical metal' };
    const req = {
      id: `req_${Date.now()}`,
      type: 'Card request',
      detail: labels[brand] || brand,
      status: 'In review',
      at: Date.now(),
      firstName: String(data.firstName || '').trim(),
      lastName: String(data.lastName || '').trim(),
    };
    account.requests = [req, ...(account.requests || [])];
    account.notifications = [
      { id: `n_${Date.now()}`, text: `Card request received — ${req.detail}.`, unread: true, at: Date.now() },
      ...(account.notifications || []),
    ];
    if (data.firstName) account.name = `${req.firstName} ${req.lastName}`.trim();
    saveAccount(account);
    showFlash(orderFlash, 'Request submitted.', 'ok');
    mountDashboard(account);
  });

  document.body.addEventListener('click', (event) => {
    if (event.target.closest('[data-open-dash]')) {
      openDashboardIfSession();
    }
  });

  const menu = document.querySelector('[data-menu]');
  const drawer = document.getElementById('drawer');
  menu?.addEventListener('click', () => {
    if (!drawer) return;
    drawer.hidden = !drawer.hidden;
  });
  drawer?.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => {
      drawer.hidden = true;
    });
  });

  syncIssuedAccount(loadStore());
  paintMarketing();
  openDashboardIfSession();
})();
