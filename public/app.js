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
};

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
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);
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

function loginHtml() {
  return `<div class="login">
      <section class="login-hero" aria-hidden="true">
        <i class="orb o1"></i><i class="orb o2"></i><i class="orb o3"></i>
        <div class="mark light">GG<span>CARD</span></div>
        <div class="hero-cards">
          ${plasticCard({ brand: 'visa', pan: '•••• •••• •••• 0000', holder: 'GG Card', expiry: '••/••', balance: money(0), note: 'Visa' })}
          ${plasticCard({ brand: 'mastercard', pan: '•••• •••• •••• 0000', holder: 'GG Card', expiry: '••/••', balance: money(0), note: 'Mastercard' })}
        </div>
        <p class="hero-line">Cards for your clients, funded by the tokens they hold.</p>
      </section>
      <section class="login-pane">
        <form id="auth-form" class="login-card stack">
          <p class="kicker">Admin desk</p>
          <h1>Sign in</h1>
          <p class="lede">Only the GG Card admin signs in. Clients are served from the desk.</p>
          ${flashHtml()}
          <label>Username <input name="username" autocomplete="username" placeholder="Username" required /></label>
          <label>Password <input name="password" type="password" autocomplete="current-password" required /></label>
          <button class="primary wide" type="submit">Open the desk</button>
        </form>
      </section>
    </div>`;
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
  const live = Boolean(state.config?.livemode);
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
        <article class="stat ${live ? 'live' : ''}"><small>Card program</small><strong>${live ? 'Live' : 'Not connected'}</strong></article>
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
          ${live
            ? `<section class="panel program-live"><h2>Card program</h2><p class="lede">Immersve is connected on ${esc(state.config.network)}. Issue a card from any client.</p><span class="pill good">Live</span></section>`
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
  if (state.config?.livemode) return '';
  return `<section class="panel">
    <h2>Connect the live card</h2>
    <p class="lede">Immersve issues the Mastercard. Paste the live API key and secret from your Immersve partner account, plus the partner account, client application, card program, and funding channel. Test keys are refused.</p>
    <form id="setup-form" class="stack">
      <label>Live API key <input name="apiKey" type="password" autocomplete="off" spellcheck="false" placeholder="imm-key-…" required /></label>
      <label>Live API secret <input name="apiSecret" type="password" autocomplete="off" spellcheck="false" placeholder="imm-secret-…" required /></label>
      <label>Partner account id <input name="partnerAccountId" autocomplete="off" spellcheck="false" required /></label>
      <label>Client application id <input name="clientApplicationId" autocomplete="off" spellcheck="false" required /></label>
      <label>Card program id <input name="cardProgramId" autocomplete="off" spellcheck="false" required /></label>
      <label>Funding channel id <input name="fundingChannelId" autocomplete="off" spellcheck="false" required /></label>
      <label>Allowed origin <input name="clientOrigin" autocomplete="off" spellcheck="false" placeholder="https://your.domain" required /></label>
      <label>Network <input name="network" autocomplete="off" spellcheck="false" value="ethereum-mainnet" required /></label>
      <button class="primary" type="submit">Connect Immersve</button>
    </form>
  </section>`;
}

function issueForm() {
  if (state.me.card) return '';
  if (!state.config?.livemode) {
    return `<section class="panel"><h2>Issue the card</h2><p class="lede">Connect the live Immersve program from the desk first. Then this client can be issued a card.</p><button class="ghost" type="button" data-action="back-to-desk">Back to the desk</button></section>`;
  }
  return `<section class="panel">
    <h2>Issue the card</h2>
    <p class="lede">Immersve creates this Mastercard for the client. Link the client wallet first. That wallet signs in, then the client finishes identity checks when Immersve asks for them.</p>
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
      <div class="full"><button class="primary" type="submit">Issue card</button></div>
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
          <h2>Wallets</h2>
          <p class="lede">Apple Pay is added from the iPhone app. Google Pay and Samsung Pay use the one-time secure card link.</p>
          <div id="secure-card" class="secure"></div>
          <div class="row" style="margin-top:12px">
            <button class="primary" type="button" data-action="wallet" data-wallet="apple">Add to Apple Pay</button>
            <button class="primary" type="button" data-action="wallet" data-wallet="google">Add to Google Pay</button>
            <button class="primary" type="button" data-action="wallet" data-wallet="samsung">Add to Samsung Pay</button>
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

function depositHtml() {
  const wallet = state.me?.wallet;
  if (!wallet) {
    return `<section class="panel" id="deposit-panel">
      <h2>Deposit</h2>
      <p class="lede">Connect the wallet with a private key. The networks that account holds will show here, with a QR code and an address.</p>
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
    <p class="lede">Pick a network this wallet holds, then scan the code or copy the address.</p>
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
  root.innerHTML = !state.admin ? loginHtml() : state.clientId && state.me ? dashboardHtml() : consoleHtml();
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

document.body.addEventListener('input', (event) => {
  if (event.target.id !== 'client-search') return;
  state.search = event.target.value;
  const list = document.querySelector('.client-list');
  if (!list) return;
  const rows = clientRows();
  list.innerHTML = rows.length ? rows.map(clientRowHtml).join('') : '<p class="muted empty">No clients match.</p>';
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

async function mountLiveCard() {
  const host = document.getElementById('secure-card');
  if (!host || !state.me?.card) return;
  host.innerHTML = '<p class="muted">The full card number stays at Immersve. Use “Show card number” when you add it to Google Pay or Samsung Pay.</p>';
}

document.body.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
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
  if (action === 'logout') {
    run(async () => {
      await api('/api/logout', { method: 'POST', body: {} });
      resetClientView();
      state.me = null;
      state.admin = null;
      state.clientId = '';
      state.desk = null;
      state.flash = null;
      render();
    });
  }
  if (action === 'select-token') {
    state.selectedTokenId = button.dataset.id;
    state.quote = null;
    render();
  }
  if (action === 'wallet') {
    run(async () => {
      const wallet = button.dataset.wallet;
      if (wallet === 'google' || wallet === 'samsung') {
        const secure = await api('/api/wallets/secure-details', { method: 'POST', body: {} });
        state.walletNote = `Open this one-time link to read the card number, then add it in ${wallet === 'google' ? 'Google Pay' : 'Samsung Pay'}:\n${secure.callbackUrl}`;
        state.flash = null;
        render();
        return;
      }
      const result = await api('/api/wallets/apple', { method: 'POST', body: {} });
      state.walletNote = walletCopy('apple', result);
      state.flash = null;
      render();
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
      await api('/api/login', { method: 'POST', body: data, noClient: true });
      state.admin = await api('/api/me', { noClient: true });
      state.flash = null;
      await loadDesk();
      render();
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
          state.flash = { kind: 'ok', text: 'Finish the identity check, then issue the card again.' };
          state.walletNote = issued.kycUrl;
        } else {
          state.flash = { kind: 'ok', text: 'Card issued.' };
        }
      } else if (result.status === 'kyc_required') {
        state.flash = { kind: 'ok', text: 'Finish the identity check, then issue the card again.' };
        state.walletNote = result.kycUrl;
      } else {
        state.flash = { kind: 'ok', text: 'Card issued.' };
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
  if (form.id === 'setup-form') {
    run(async () => {
      await api('/api/setup', { method: 'POST', body: data, noClient: true });
      state.flash = { kind: 'ok', text: 'Live Immersve is connected. Open a client to issue the card.' };
      await loadDesk();
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
  state.keyAddress = '';
  state.walletNote = '';
  state.walletSignature = '';
}

async function loadDesk() {
  state.config = await api('/api/config');
  state.desk = await api('/api/admin/desk', { noClient: true });
}

async function boot() {
  state.config = await api('/api/config');
  try {
    const me = await api('/api/me', { noClient: true });
    if (me.user?.role !== 'admin') throw new Error('not admin');
    state.admin = me;
    await loadDesk();
  } catch {
    state.admin = null;
  }
  render();
}

boot().catch((error) => {
  document.getElementById('app').textContent = error.message || 'The card app failed to load.';
});
