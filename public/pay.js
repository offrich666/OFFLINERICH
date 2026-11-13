/** G Cards EU bank-style gateway — TEB / RBKO / NLB completion for website-issued cards. */
(function () {
  const LEDGER_KEY = 'gcards-desk-ledger-v8';
  const PAY_KEY = 'gcards-pay-intent-v1';

  const BANKS = [
    { id: 'teb', name: 'TEB', detail: 'TEB Bankë' },
    { id: 'rbko', name: 'RBKO', detail: 'Raiffeisen' },
    { id: 'nlb', name: 'NLB', detail: 'NLB Banka' },
  ];

  const state = {
    bank: 'teb',
    phase: 'form', // form | processing | done | error
    error: '',
    receipt: null,
    card: null,
    amountCents: 0,
    merchant: 'Gjirafa50',
  };

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]),
    );
  }

  function money(cents) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format((cents || 0) / 100);
  }

  function formatPan(pan) {
    return String(pan || '')
      .replace(/\D/g, '')
      .replace(/(\d{4})(?=\d)/g, '$1 ')
      .trim();
  }

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

  function readLedger() {
    try {
      return JSON.parse(localStorage.getItem(LEDGER_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function writeLedger(data) {
    localStorage.setItem(LEDGER_KEY, JSON.stringify(data));
  }

  function loadIntent() {
    let intent = null;
    try {
      intent = JSON.parse(sessionStorage.getItem(PAY_KEY) || 'null');
    } catch {
      intent = null;
    }
    const params = new URLSearchParams(location.search);
    const amountParam = Number(params.get('amount') || intent?.amountCents || 2500);
    const merchant = params.get('merchant') || intent?.merchant || 'Gjirafa50';
    const ledger = readLedger();
    const cards = Array.isArray(ledger.deskCards) ? ledger.deskCards : [];
    const fromIntent = intent?.pan
      ? {
          pan: String(intent.pan).replace(/\D/g, ''),
          expiry: intent.expiry || '',
          cvv: intent.cvv || '',
          holder: intent.holder || 'G Cards Member',
        }
      : null;
    const fromLedger = cards.find((card) => panPassesLuhn(card?.pan)) || cards[0] || null;
    state.card = fromIntent || (fromLedger
      ? {
          pan: String(fromLedger.pan).replace(/\D/g, ''),
          expiry: fromLedger.expiry || '',
          cvv: fromLedger.cvv || '',
          holder: fromLedger.holder || 'G Cards Member',
        }
      : null);
    state.amountCents = Number.isFinite(amountParam) && amountParam > 0 ? Math.round(amountParam) : 2500;
    state.merchant = merchant;
    if (intent?.bank && BANKS.some((bank) => bank.id === intent.bank)) state.bank = intent.bank;
  }

  function render() {
    const root = document.getElementById('app');
    if (state.phase === 'processing') {
      const bank = BANKS.find((row) => row.id === state.bank);
      root.innerHTML = `<div class="brand"><strong>G Cards EU</strong><span>${esc(bank?.name)} gateway</span></div>
        <section class="panel processing">
          <div class="spinner" aria-hidden="true"></div>
          <h1>Duke autorizuar…</h1>
          <p class="lede">${esc(bank?.name)} · ${esc(bank?.detail)} po kontrollon kartelën tuaj.</p>
        </section>`;
      return;
    }

    if (state.phase === 'done' && state.receipt) {
      const r = state.receipt;
      root.innerHTML = `<div class="brand"><strong>G Cards EU</strong><span>${esc(r.bankName)}</span></div>
        <section class="panel done">
          <div class="mark" aria-hidden="true">✓</div>
          <h1>Completed</h1>
          <p class="lede">Pagesa u krye me sukses përmes ${esc(r.bankName)}.</p>
          <div class="flash ok">Status: COMPLETED · Auth ${esc(r.authCode)}</div>
          <div class="meta">
            <div><span>Merchant</span><strong>${esc(r.merchant)}</strong></div>
            <div><span>Amount</span><strong>${esc(money(r.amountCents))}</strong></div>
            <div><span>Card</span><strong>•••• ${esc(r.last4)}</strong></div>
            <div><span>Gateway</span><strong>${esc(r.bankName)}</strong></div>
            <div><span>Time</span><strong>${esc(r.when)}</strong></div>
          </div>
          <div class="actions">
            <a class="primary" href="desk.html" style="text-align:center;text-decoration:none">Back to desk</a>
            <button class="ghost" type="button" id="pay-again">Pay again</button>
          </div>
        </section>`;
      document.getElementById('pay-again')?.addEventListener('click', () => {
        state.phase = 'form';
        state.receipt = null;
        state.error = '';
        render();
      });
      return;
    }

    const card = state.card;
    const panValue = card ? formatPan(card.pan) : '';
    const flash = state.error ? `<div class="flash err">${esc(state.error)}</div>` : '';
    root.innerHTML = `<div class="brand"><strong>G Cards EU</strong><span>Secure checkout</span></div>
      <section class="panel">
        <h1>Payment gateway</h1>
        <p class="lede">Zgjidhni bankën (TEB · RBKO · NLB) dhe paguani me kartelën e lëshuar në g-cards.eu.</p>
        ${flash}
        <div class="amount">
          <div><small>Amount</small><strong>${esc(money(state.amountCents))}</strong></div>
          <div style="text-align:right"><small>Merchant</small><strong>${esc(state.merchant)}</strong></div>
        </div>
        <div class="banks" role="group" aria-label="Bank gateway">
          ${BANKS.map(
            (bank) => `<button type="button" class="bank ${state.bank === bank.id ? 'on' : ''}" data-bank="${bank.id}">
              <b>${esc(bank.name)}</b><small>${esc(bank.detail)}</small>
            </button>`,
          ).join('')}
        </div>
        <form id="pay-form" class="stack">
          <label>Emri në kartelë
            <input name="holder" autocomplete="cc-name" value="${esc(card?.holder || 'G Cards Member')}" required />
          </label>
          <label>Numri i kartelës
            <input name="pan" inputmode="numeric" autocomplete="cc-number" value="${esc(panValue)}" required />
          </label>
          <div class="row-2">
            <label>Skadenca
              <input name="expiry" placeholder="MM/YY" autocomplete="cc-exp" value="${esc(card?.expiry || '')}" required />
            </label>
            <label>CVV
              <input name="cvv" inputmode="numeric" autocomplete="cc-csc" value="${esc(card?.cvv || '')}" required />
            </label>
          </div>
          <button class="primary" type="submit">Pay with ${esc(BANKS.find((b) => b.id === state.bank)?.name || 'bank')}</button>
        </form>
      </section>`;

    document.querySelectorAll('.bank').forEach((button) => {
      button.addEventListener('click', () => {
        state.bank = button.getAttribute('data-bank') || 'teb';
        state.error = '';
        render();
      });
    });

    document.getElementById('pay-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.target).entries());
      runPayment(data);
    });
  }

  function runPayment(data) {
    const pan = String(data.pan || '').replace(/\D/g, '');
    const cvv = String(data.cvv || '').replace(/\D/g, '');
    const expiry = String(data.expiry || '').trim();
    const holder = String(data.holder || '').trim();
    const bank = BANKS.find((row) => row.id === state.bank) || BANKS[0];

    if (!panPassesLuhn(pan)) {
      state.error = 'Numri nuk është i saktë — përdorni kartelën e re nga g-cards.eu desk.';
      render();
      return;
    }
    if (!/^\d{3,4}$/.test(cvv)) {
      state.error = 'CVV gabim.';
      render();
      return;
    }
    if (!/^\d{2}\/\d{2}$/.test(expiry)) {
      state.error = 'Data e skadencës duhet MM/YY.';
      render();
      return;
    }

    const ledger = readLedger();
    const balance = typeof ledger.deskBalanceCents === 'number' ? ledger.deskBalanceCents : 0;
    if (balance < state.amountCents) {
      state.error = `Fondet nuk mjaftojnë. Spendable ${money(balance)} · kërkohet ${money(state.amountCents)}. Depozitoni në desk.`;
      render();
      return;
    }

    state.phase = 'processing';
    state.error = '';
    render();

    window.setTimeout(() => {
      const nextBalance = balance - state.amountCents;
      const when = new Date().toLocaleString('en-GB', { timeZone: 'Europe/Belgrade', hour12: false });
      const authCode = `GC${Math.floor(100000 + Math.random() * 900000)}`;
      const deposits = Array.isArray(ledger.deskDeposits) ? ledger.deskDeposits : [];
      deposits.unshift({
        when,
        token: bank.name,
        amount: money(state.amountCents),
        creditCents: -state.amountCents,
        kind: 'gateway_pay',
        bank: bank.id,
        authCode,
        merchant: state.merchant,
      });
      writeLedger({
        deskCards: ledger.deskCards || [],
        deskBalanceCents: nextBalance,
        deskDeposits: deposits,
      });
      try {
        sessionStorage.removeItem(PAY_KEY);
      } catch {
        /* ignore */
      }
      state.receipt = {
        bankName: bank.name,
        amountCents: state.amountCents,
        merchant: state.merchant,
        last4: pan.slice(-4),
        authCode,
        when,
        holder,
      };
      state.phase = 'done';
      render();
    }, 1400);
  }

  loadIntent();
  render();
})();
