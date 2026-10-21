const state = {
  config: null,
  me: null,
  tokens: [],
  activity: [],
  flash: null,
  authMode: 'register',
  selectedTokenId: '',
  walletNote: '',
  quote: null,
  amount: '',
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
  const response = await fetch(path, {
    method: options.method || 'GET',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
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
  state.tokens = tokens.tokens;
  state.activity = activity.activity;
  if (!state.selectedTokenId || !state.tokens.some((token) => token.id === state.selectedTokenId)) {
    const preferred = state.tokens.find((token) => token.symbol === 'USDC' && token.chainId === 8453);
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

function authHtml() {
  const login = state.authMode === 'login';
  return `<header class="top wrap">
      <div class="mark">OFFLINE<span>RICH</span></div>
      <p>USD debit · funded by the tokens you hold</p>
    </header>
    <main class="wrap stack auth">
      ${flashHtml()}
      <section class="panel">
        <p class="kicker">Worldwide card</p>
        <h1>Spend the tokens you already own.</h1>
        <p class="lede">Add a token by its contract, send it to your treasury, and the USD value becomes spendable anywhere the card network is accepted. Apple Pay, Google Pay, and Samsung Pay use the same card.</p>
        <form id="auth-form" class="stack">
          <label>Email <input name="email" type="email" autocomplete="email" required /></label>
          <label>Password <input name="password" type="password" autocomplete="${login ? 'current-password' : 'new-password'}" minlength="8" required /></label>
          <div class="row">
            <button class="primary" type="submit">${login ? 'Sign in' : 'Create account'}</button>
            <button class="ghost" type="button" data-action="toggle-auth">${login ? 'Need an account?' : 'Have an account?'}</button>
          </div>
        </form>
      </section>
      <section class="panel">
        <h2>What has to be connected</h2>
        <p class="lede">The card spends through Stripe Issuing. Token value comes from the chain and DefiLlama. The phone wallets each have their own issuer API.</p>
        ${readinessHtml()}
      </section>
    </main>`;
}

function tokenButton(token) {
  const on = token.id === state.selectedTokenId ? 'on' : '';
  const price = token.priceUsd == null ? 'Price pending' : money(Math.round(token.priceUsd * 100));
  return `<button type="button" class="token ${on}" data-action="select-token" data-id="${esc(token.id)}">
      <span><b>${esc(token.symbol)}</b><span>${esc(token.chainName)} · ${esc(token.source)}</span></span>
      <span>${esc(price)}</span>
    </button>`;
}

function cardHtml() {
  const card = state.me.card;
  const balance = state.me.balance.availableCents;
  const name = state.me.cardholder ? `${state.me.cardholder.firstName} ${state.me.cardholder.lastName}` : 'Your name';
  if (!card) {
    return `<article class="plastic">
      <div class="plastic-top"><span>OfflineRich</span><span>USD debit</span></div>
      <div class="chip"></div>
      <p class="pan">Card not issued</p>
      <div class="plastic-bottom"><div><small>Spendable</small><strong>${esc(money(balance))}</strong></div></div>
    </article>`;
  }
  const month = String(card.expMonth).padStart(2, '0');
  const year = String(card.expYear).slice(-2);
  return `<article class="plastic">
      ${card.issuerMode === 'simulated' ? '<em class="ribbon">Simulator</em>' : ''}
      <div class="plastic-top"><span>OfflineRich</span><span>${esc(card.brand)} · ${esc(card.type)}</span></div>
      <div class="chip"></div>
      <p class="pan">•••• •••• •••• ${esc(card.last4)}</p>
      <div class="plastic-bottom">
        <div><small>Name</small><strong>${esc(name)}</strong></div>
        <div><small>Expires</small><strong>${esc(month)}/${esc(year)}</strong></div>
        <div><small>Spendable</small><strong>${esc(money(balance))}</strong></div>
      </div>
    </article>
    <p class="world">${card.status === 'active' ? 'Active' : 'Waiting for a top-up'} · USD · accepted worldwide, with network conversion at the merchant.</p>`;
}

function issueForm() {
  if (state.me.card) return '';
  return `<section class="panel">
    <h2>Issue the card</h2>
    <p class="lede">The name, phone, and email are what Apple Pay, Google Pay, and Samsung Pay use to verify the card. Identity is sent to Stripe Issuing when that key is connected.</p>
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
      <label class="check full"><input type="checkbox" name="acceptedTerms" required /> <span>I accept the cardholder terms and I am the person named on this card.</span></label>
      <div class="full"><button class="primary" type="submit">Issue card</button></div>
    </form>
  </section>`;
}

function dashboardHtml() {
  const wallet = state.me.wallet;
  const blocked = (state.config.blockedCountries || []).join(', ');
  return `<header class="top wrap">
      <div class="mark">OFFLINE<span>RICH</span></div>
      <div class="row">
        <p>${esc(money(state.me.balance.availableCents))} spendable</p>
        <button class="ghost" type="button" data-action="logout">Sign out</button>
      </div>
    </header>
    <main class="wrap layout">
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
        </section>
      </div>
      <div class="stack">
        ${flashHtml()}
        ${issueForm()}
        <section class="panel">
          <h2>Tokens</h2>
          <p class="lede">Pick a token you hold, or add any ERC-20 by chain and contract. The contract’s name, symbol, and decimals are read on-chain.</p>
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
          <p class="lede">The deposit is valued in USD, a ${esc(String((state.config.feeBps || 0) / 100))}% fee is kept, and the rest becomes spendable.</p>
          <form id="quote-form" class="row">
            <label style="flex:1">Amount <input name="amount" inputmode="decimal" placeholder="25" value="${esc(state.amount)}" required /></label>
            <button class="primary" type="submit">Quote</button>
          </form>
          <div id="quote" class="quote" style="margin-top:12px">${quoteHtml()}</div>
          ${topupActions()}
        </section>
        <section class="panel">
          <h2>Wallets</h2>
          <p class="lede">Add the same card to Apple Pay, Google Pay, or Samsung Pay. Live buttons appear when Stripe.js has a publishable key and the card was issued by Stripe.</p>
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
        ${purchaseHtml(blocked)}
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
              : '<li><p class="muted">Top-ups and charges will show here.</p></li>'
          }</ul>
        </section>
        <section class="panel">
          <h2>Connections</h2>
          ${readinessHtml()}
        </section>
      </div>
    </main>`;
}

function quoteHtml() {
  const quote = state.quote;
  if (!quote) return 'Quote a top-up to see the USD credit.';
  const lines = [
    `${quote.amount} ${quote.symbol} on ${quote.chainName}`,
    `Price ${money(Math.round(quote.priceUsd * 100))} · fee ${money(quote.feeCents)} · you get ${money(quote.netCents)}`,
  ];
  if (quote.treasuryAddress) lines.push(`Send the token to ${quote.treasuryAddress}, then paste the transaction hash.`);
  return esc(lines.join('\n'));
}

function topupActions() {
  if (!state.quote) return '';
  const send = state.quote.treasuryAddress
    ? `<input id="tx-hash" placeholder="0x transaction hash" style="flex:1" />
       <button class="primary" type="button" data-action="confirm-topup">I sent it</button>`
    : '';
  const simulate = state.config.simulatedTopups
    ? '<button class="ghost" type="button" data-action="simulate-topup">Credit in the simulator</button>'
    : '';
  return `<div class="row" style="margin-top:10px">${send}${simulate}</div>`;
}

function purchaseHtml(blocked) {
  if (!state.config.simulatePurchases) return '';
  const places = [
    ['Kissaten', 'JP'],
    ['Lagos Grill', 'NG'],
    ['Berlin Bäckerei', 'DE'],
    ['São Paulo Café', 'BR'],
    ['Marina Bay', 'SG'],
    ['Dubai Mall', 'AE'],
  ];
  return `<section class="panel">
      <h2>Try a charge</h2>
      <p class="lede">This rehearses a merchant authorization in the card’s USD balance.${blocked ? ` Blocked merchant countries: ${esc(blocked)}.` : ' Every merchant country is open.'}</p>
      <div class="chips">${places
        .map(
          ([name, country]) =>
            `<button class="tiny" type="button" data-action="place" data-name="${esc(name)}" data-country="${country}">${esc(name)}</button>`,
        )
        .join('')}</div>
      <form id="purchase-form" class="grid-2" style="margin-top:12px">
        <label>Merchant <input name="merchantName" value="Kissaten" required /></label>
        <label>Country <input name="merchantCountry" value="JP" maxlength="2" required /></label>
        <label>USD <input name="amount" value="4.50" required /></label>
        <div class="full"><button class="primary" type="submit">Charge the card</button></div>
      </form>
    </section>`;
}

function render() {
  const root = document.getElementById('app');
  root.innerHTML = state.me ? dashboardHtml() : authHtml();
  const generation = ++mountGeneration;
  mountLiveCard(generation);
}

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

async function loadStripeJs() {
  if (window.Stripe) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Stripe.js did not load.'));
    document.head.appendChild(script);
  });
}

async function mountLiveCard(generation) {
  const card = state.me?.card;
  const publishable = state.config?.stripePublishableKey;
  if (!card || card.issuerMode !== 'stripe' || !publishable) return;
  const host = document.getElementById('secure-card');
  if (!host) return;
  host.innerHTML = '<p class="muted">Opening the secure card frame…</p><div id="card-number" class="line"></div><div id="card-expiry" class="line"></div><div id="card-cvc" class="line"></div>';
  try {
    await loadStripeJs();
    if (generation !== mountGeneration) return;
    const stripe = window.Stripe(publishable, {
      betas: ['issuing_add_to_wallet_button_element_1', 'issuing_elements_2'],
    });
    const elements = stripe.elements();
    const nonceResult = await stripe.createEphemeralKeyNonce({ issuingCard: card.issuerCardId });
    const key = await api('/api/wallets/ephemeral-key', {
      method: 'POST',
      body: { cardId: card.id, nonce: nonceResult.nonce },
    });
    if (generation !== mountGeneration) return;
    await stripe.retrieveIssuingCard(card.issuerCardId, {
      ephemeralKeySecret: key.ephemeralKeySecret || key.secret,
      nonce: nonceResult.nonce,
    });
    const style = { base: { color: '#f4f0e6', fontSize: '16px' } };
    const shared = {
      issuingCard: card.issuerCardId,
      nonce: nonceResult.nonce,
      ephemeralKeySecret: key.ephemeralKeySecret || key.secret,
      style,
    };
    for (const [type, elementId] of [
      ['issuingCardNumberDisplay', 'card-number'],
      ['issuingCardExpiryDisplay', 'card-expiry'],
      ['issuingCardCvcDisplay', 'card-cvc'],
    ]) {
      const element = elements.create(type, shared);
      element.mount(`#${elementId}`);
    }
    for (const [wallet, elementId] of [
      ['apple', 'apple-wallet'],
      ['google', 'google-wallet'],
    ]) {
      const button = elements.create('issuingAddToWalletButton', { ...shared, wallet, buttonHeight: 44 });
      button.on('success', () => {
        api('/api/wallets/events', { method: 'POST', body: { wallet: wallet === 'apple' ? 'apple_pay' : 'google_pay', status: 'added' } })
          .then(refresh)
          .then(render)
          .catch(() => {});
      });
      button.mount(`#${elementId}`);
    }
  } catch (error) {
    if (generation !== mountGeneration) return;
    host.innerHTML = `<p class="muted">${esc(error.message || 'The secure card frame is unavailable.')}</p>`;
  }
}

document.body.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'toggle-auth') {
    state.authMode = state.authMode === 'login' ? 'register' : 'login';
    render();
  }
  if (action === 'logout') {
    run(async () => {
      await api('/api/logout', { method: 'POST', body: {} });
      state.me = null;
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
      const path = wallet === 'apple' ? '/api/wallets/apple' : wallet === 'google' ? '/api/wallets/google' : '/api/wallets/samsung';
      const result = await api(path, { method: 'POST', body: {} });
      state.walletNote = walletCopy(wallet, result);
      state.flash = null;
      render();
    });
  }
  if (action === 'place') {
    const form = document.getElementById('purchase-form');
    if (!form) return;
    form.merchantName.value = button.dataset.name;
    form.merchantCountry.value = button.dataset.country;
  }
  if (action === 'connect-wallet') {
    run(() => connectBrowserWallet());
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
  if (action === 'simulate-topup') {
    run(async () => {
      const result = await api('/api/topups/simulate', {
        method: 'POST',
        body: { tokenId: state.selectedTokenId, amount: state.amount },
      });
      state.flash = { kind: 'ok', text: `${money(result.creditedCents)} simulator credit added.` };
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
      const path = state.authMode === 'login' ? '/api/login' : '/api/register';
      await api(path, { method: 'POST', body: data });
      state.flash = null;
      await refresh();
      render();
    });
  }
  if (form.id === 'card-form') {
    run(async () => {
      const month = String(data.dobMonth || '').padStart(2, '0');
      const day = String(data.dobDay || '').padStart(2, '0');
      await api('/api/card', {
        method: 'POST',
        body: {
          ...data,
          dob: `${data.dobYear}-${month}-${day}`,
          acceptedTerms: form.acceptedTerms.checked,
          country: String(data.country || '').toUpperCase(),
        },
      });
      state.flash = { kind: 'ok', text: 'Card issued.' };
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
  if (form.id === 'purchase-form') {
    run(async () => {
      const result = await api('/api/purchases/simulate', { method: 'POST', body: data });
      state.flash = { kind: result.approved ? 'ok' : 'error', text: result.message };
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

async function boot() {
  state.config = await api('/api/config');
  try {
    await refresh();
  } catch {
    state.me = null;
  }
  render();
}

boot().catch((error) => {
  document.getElementById('app').textContent = error.message || 'The card app failed to load.';
});
