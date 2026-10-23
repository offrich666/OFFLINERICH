/** Public client portal — register, then order a card. Company ops stay on /desk. */
(function () {
  const SESSION_KEY = 'gcards_eu_client';
  const ACCOUNTS_KEY = 'gcards_eu_accounts';
  const ORDER_KEY = 'gcards_eu_order';

  const authFlash = document.getElementById('auth-flash');
  const orderFlash = document.getElementById('order-flash');
  const sessionLine = document.getElementById('session-line');
  const registerForm = document.getElementById('register-form');
  const signinForm = document.getElementById('signin-form');
  const orderForm = document.getElementById('order-form');
  const orderLock = document.getElementById('order-lock');
  const orderDone = document.getElementById('order-done');
  const orderDoneCopy = document.getElementById('order-done-copy');

  function hasApi() {
    return Boolean(window.GCARDS_SITE?.hasApi?.());
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

  function localAccounts() {
    try {
      return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function rememberLocalAccount(email) {
    const accounts = localAccounts();
    accounts[email] = true;
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  }

  function readOrder() {
    try {
      return JSON.parse(localStorage.getItem(ORDER_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function writeOrder(order) {
    if (!order) localStorage.removeItem(ORDER_KEY);
    else localStorage.setItem(ORDER_KEY, JSON.stringify(order));
  }

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

  function paintSession() {
    const session = readSession();
    const order = readOrder();
    if (sessionLine) {
      if (session?.email) {
        sessionLine.hidden = false;
        sessionLine.textContent = `Signed in as ${session.email}`;
      } else {
        sessionLine.hidden = true;
        sessionLine.textContent = '';
      }
    }
    if (orderForm && orderLock) {
      if (session?.email) {
        orderLock.hidden = true;
        orderForm.hidden = Boolean(order);
      } else {
        orderLock.hidden = false;
        orderForm.hidden = true;
      }
    }
    if (orderDone && orderDoneCopy) {
      if (order && session?.email) {
        orderDone.hidden = false;
        if (orderForm) orderForm.hidden = true;
        orderDoneCopy.textContent = `${order.cardBrandLabel} for ${order.firstName} ${order.lastName} · ${session.email}. We will process the order and notify you when the card is ready.`;
      } else {
        orderDone.hidden = true;
      }
    }
  }

  async function api(path, body) {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || 'Request failed.');
    return data;
  }

  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      document.querySelectorAll('[data-tab]').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      if (registerForm) registerForm.hidden = tab !== 'register';
      if (signinForm) signinForm.hidden = tab !== 'signin';
      showFlash(authFlash, '');
    });
  });

  registerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(registerForm).entries());
    const email = String(data.email || '').trim().toLowerCase();
    const password = String(data.password || '');
    showFlash(authFlash, '');
    try {
      if (hasApi()) {
        const result = await api('/api/register', { email, password });
        writeSession({ email: result.user?.email || email, token: result.token || '' });
      } else {
        rememberLocalAccount(email);
        writeSession({ email, local: true });
      }
      showFlash(authFlash, 'Account created. You can order a card below.', 'ok');
      paintSession();
      document.getElementById('order')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      showFlash(authFlash, error.message || 'Could not register.', 'error');
    }
  });

  signinForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(signinForm).entries());
    const email = String(data.email || '').trim().toLowerCase();
    const password = String(data.password || '');
    showFlash(authFlash, '');
    try {
      if (hasApi()) {
        const result = await api('/api/login', { email, password });
        if (result.user?.role === 'admin') throw new Error('Use the admin desk for that account.');
        writeSession({ email: result.user?.email || email, token: result.token || '' });
      } else {
        if (!localAccounts()[email]) {
          throw new Error('No account for that email. Register first.');
        }
        writeSession({ email, local: true });
      }
      showFlash(authFlash, 'Signed in.', 'ok');
      paintSession();
      document.getElementById('order')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      showFlash(authFlash, error.message || 'Invalid', 'error');
    }
  });

  const brandLabels = {
    visa: 'Virtual Visa',
    mastercard: 'Virtual Mastercard',
    metal: 'Physical metal',
  };

  orderForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const session = readSession();
    if (!session?.email) {
      showFlash(orderFlash, 'Register or sign in first.', 'error');
      return;
    }
    const data = Object.fromEntries(new FormData(orderForm).entries());
    const brand = String(data.cardBrand || 'visa');
    showFlash(orderFlash, '');
    writeOrder({
      email: session.email,
      cardBrand: brand,
      cardBrandLabel: brandLabels[brand] || brand,
      firstName: String(data.firstName || '').trim(),
      lastName: String(data.lastName || '').trim(),
      phone: String(data.phone || '').trim(),
      country: String(data.country || '').trim().toUpperCase(),
      city: String(data.city || '').trim(),
      line1: String(data.line1 || '').trim(),
      at: Date.now(),
    });
    showFlash(orderFlash, 'Order received.', 'ok');
    paintSession();
  });

  // Menu drawer for client site
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

  paintSession();
})();
