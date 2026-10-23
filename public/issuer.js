const PRICE_USD = 1300;

function cardBase(key) {
  const narrow = window.matchMedia('(max-width: 960px)').matches;
  if (narrow) {
    return {
      visa: 'translate3d(-18px, -22px, 16px) rotateZ(-7deg)',
      master: 'translate3d(0, 4px, 52px) rotateZ(1deg)',
      amex: 'translate3d(18px, 30px, 90px) rotateZ(8deg)',
    }[key];
  }
  return {
    visa: 'translate3d(-28px, -32px, 16px) rotateZ(-8deg)',
    master: 'translate3d(0, 6px, 60px) rotateZ(2deg)',
    amex: 'translate3d(28px, 42px, 104px) rotateZ(9deg)',
  }[key];
}

function applyCardTransform(card) {
  const key = card.dataset.base || 'master';
  const base = cardBase(key) || cardBase('master');
  const rx = card.style.getPropertyValue('--rx') || '0deg';
  const ry = card.style.getPropertyValue('--ry') || '0deg';
  card.style.transform = `${base} rotateX(${rx}) rotateY(${ry})`;
}

function bindDeck(root) {
  const deck = root.querySelector('[data-deck]');
  const scene = root.querySelector('#scene');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!deck || !scene) return;

  let rotY = -22;
  let rotX = 14;
  let auto = !reduce;
  let dragging = false;
  let moved = false;
  let lastX = 0;
  let lastY = 0;
  let startX = 0;
  let startY = 0;
  let raf = 0;

  const paint = () => {
    deck.style.transform = `rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg)`;
  };

  const tick = () => {
    if (auto && !dragging) {
      rotY += 0.35;
      if (rotY > 180) rotY -= 360;
      paint();
    }
    raf = requestAnimationFrame(tick);
  };

  paint();
  if (!reduce) raf = requestAnimationFrame(tick);

  scene.addEventListener('pointerdown', (event) => {
    if (event.target.closest('[data-card]')) return;
    dragging = true;
    moved = false;
    auto = false;
    lastX = event.clientX;
    lastY = event.clientY;
    startX = event.clientX;
    startY = event.clientY;
    scene.setPointerCapture(event.pointerId);
  });

  scene.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    if (Math.abs(event.clientX - startX) + Math.abs(event.clientY - startY) > 6) moved = true;
    rotY += dx * 0.45;
    rotX = Math.max(-28, Math.min(36, rotX - dy * 0.35));
    lastX = event.clientX;
    lastY = event.clientY;
    paint();
  });

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    if (!reduce) {
      window.setTimeout(() => {
        if (!dragging) auto = true;
      }, 1600);
    }
  };
  scene.addEventListener('pointerup', endDrag);
  scene.addEventListener('pointercancel', endDrag);
  scene.addEventListener('pointerleave', () => {
    if (dragging) endDrag();
  });

  // Expose for card handlers to pause spin while interacting
  scene.__deck = { pause: () => { auto = false; }, resume: () => { if (!reduce) auto = true; }, wasDrag: () => moved };
}

function bindCards(root) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = root.querySelector('#scene');

  root.querySelectorAll('[data-card]').forEach((card) => {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
    applyCardTransform(card);

    const setGlare = (clientX, clientY) => {
      const box = card.getBoundingClientRect();
      const x = (clientX - box.left) / box.width;
      const y = (clientY - box.top) / box.height;
      card.style.setProperty('--gx', `${(x * 100).toFixed(0)}%`);
      if (reduce || card.classList.contains('flipped')) return;
      card.style.setProperty('--rx', `${((0.5 - y) * 16).toFixed(2)}deg`);
      card.style.setProperty('--ry', `${((x - 0.5) * 20).toFixed(2)}deg`);
      applyCardTransform(card);
    };

    const reset = () => {
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
      applyCardTransform(card);
    };

    card.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch' && !dragging) return;
      setGlare(event.clientX, event.clientY);
    });
    card.addEventListener('pointerleave', reset);

    card.addEventListener('pointerdown', (event) => {
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      scene?.__deck?.pause();
      card.setPointerCapture(event.pointerId);
      event.stopPropagation();
    });

    card.addEventListener('pointerup', (event) => {
      const dx = Math.abs(event.clientX - startX);
      const dy = Math.abs(event.clientY - startY);
      dragging = false;
      if (dx < 10 && dy < 10) {
        card.classList.toggle('flipped');
        reset();
      } else {
        reset();
      }
      window.setTimeout(() => scene?.__deck?.resume(), 1200);
      event.stopPropagation();
    });

    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        card.classList.toggle('flipped');
        reset();
      }
    });
  });
}

function bindMenu() {
  const button = document.querySelector('[data-menu]');
  const drawer = document.getElementById('drawer');
  if (!button || !drawer) return;
  button.addEventListener('click', () => {
    const open = !drawer.hidden;
    drawer.hidden = open;
    button.textContent = open ? 'Menu' : 'Close';
  });
  drawer.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      drawer.hidden = true;
      button.textContent = 'Menu';
    });
  });
}

function bindCheckout() {
  const form = document.getElementById('upgrade-form');
  const result = document.getElementById('pay-result');
  if (!form || !result) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    result.style.color = '';
    result.style.borderColor = '';
    result.style.background = '';
    try {
      const response = await fetch('/api/upgrade', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...data, amountUsd: PRICE_USD }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message || 'Could not start payment.');
      result.hidden = false;
      result.textContent =
        body.instructions ||
        'USDC server payment recorded. When it clears, platform 31.2.7 unlocks on the dedicated server. Desk tokens remain for card spend only.';
      form.reset();
      result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
      result.hidden = false;
      result.textContent = error.message || 'Request failed.';
      result.style.color = '#f0a0a0';
      result.style.borderColor = 'rgba(240,160,160,0.4)';
      result.style.background = 'rgba(140,40,40,0.15)';
    } finally {
      button.disabled = false;
    }
  });
}

function bindPos() {
  const stage = document.getElementById('pos-stage');
  if (!stage) return;
  const label = stage.querySelector('[data-pos-label]');
  const status = stage.querySelector('[data-pos-status]');
  const banner = stage.querySelector('[data-pos-receipt]');
  const hint = stage.querySelector('[data-apay-hint]');
  const confirm = stage.querySelector('[data-apay-confirm]');
  const done = stage.querySelector('[data-apay-done]');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const setText = (el, text) => {
    if (el) el.textContent = text;
  };

  const show = (el, on) => {
    if (!el) return;
    el.hidden = !on;
  };

  const reset = () => {
    stage.classList.remove('is-ready', 'is-auth', 'is-tapping', 'is-approved');
    show(banner, false);
    show(confirm, false);
    show(done, false);
    setText(label, 'Hold iPhone near reader');
    setText(status, 'Ready for Apple Pay');
    setText(hint, 'Double Click Side Button');
  };

  const approved = () => {
    stage.classList.add('is-approved');
    setText(label, 'Approved');
    setText(status, 'Transaction confirmed');
    setText(hint, 'Hold Near Reader');
    show(confirm, true);
    show(done, true);
    show(banner, true);
  };

  if (reduce) {
    reset();
    approved();
    return;
  }

  const run = async () => {
    reset();
    await wait(600);
    stage.classList.add('is-ready');
    setText(hint, 'Double Click Side Button');
    await wait(700);
    stage.classList.add('is-auth');
    setText(hint, 'Face ID');
    await wait(800);
    stage.classList.remove('is-auth');
    stage.classList.add('is-tapping');
    setText(label, 'Reading Apple Pay…');
    setText(status, 'Contactless');
    setText(hint, 'Hold Near Reader');
    await wait(1200);
    stage.classList.remove('is-tapping');
    approved();
    await wait(2800);
  };

  (async () => {
    while (true) await run();
  })();
}

function bindChatbot() {
  const root = document.getElementById('chatbot');
  const panel = document.getElementById('chat-panel');
  const log = document.getElementById('chat-log');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const openBtn = document.querySelector('[data-chat-open]');
  const closeBtn = document.querySelector('[data-chat-close]');
  const suggest = document.getElementById('chat-suggest');
  if (!root || !panel || !log || !form || !input || !openBtn) return;

  const answers = {
    wait:
      'After you pay $1,300 USDC, here is what happens:\n\n1) You receive a dedicated Frankfurt server\n2) We integrate all programme files on that server (platform 31.2.7)\n3) You start issuing cards from the desk\n4) After cards are issued, you tap to pay and spend through the cards\n\nNormally the full process takes about 24 hours. We complete it faster once USDC clears.',
    process:
      'This is how we do it:\n\n• You pay the dedicated-server fee in USDC\n• You receive the dedicated server\n• We integrate all files on that server\n• You start issuing cards\n• After card issuing, you tap to pay and start paying through the cards\n\nDesk tokens only fund card spend — they do not pay for the server.',
    time:
      'How long does this process take?\n\nNormally it takes about 24 hours from USDC payment to a live issuing desk.\n\nWe do it faster: dedicated server → file integration → card issuing ready. Status keys on this page flip from In process to Done as each step finishes.',
    cards:
      'After USDC payment and we integrate all files on your dedicated server, you issue cards from the admin desk.\n\nOnce a card is issued, you can tap to pay (Apple Pay / contactless) and start paying through the cards. Tokens you add on the desk increase that spend balance.',
    usdc:
      'The $1,300 dedicated-server package is paid in USDC directly. Other tokens on the desk are only for card spend — they are not the server invoice.',
    default:
      'Ask what happens after you pay, how long you wait, or when you can issue cards and tap to pay.\n\nNormally ~24 hours after USDC — we finish faster when payment clears. Try a suggested question below.',
  };

  const matchAnswer = (text) => {
    const q = text.toLowerCase();
    if (/(wait|after (i )?pay|how long.*(after|payment)|when.*(ready|live|server))/.test(q)) return answers.wait;
    if (/(process|how (do|does|we)|steps|integrate|dedicated server|what if)/.test(q)) return answers.process;
    if (/(time|24|hour|faster|normally|how long)/.test(q)) return answers.time;
    if (/(issue|issuing|tap|apple|spend|card)/.test(q)) return answers.cards;
    if (/(usdc|token|pay)/.test(q)) return answers.usdc;
    return answers.default;
  };

  const addMsg = (role, text) => {
    const el = document.createElement('div');
    el.className = `chat-msg ${role}`;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  };

  const reply = async (text) => {
    const typing = addMsg('bot typing', 'Assistant is typing…');
    await new Promise((r) => window.setTimeout(r, 450 + Math.min(900, text.length * 4)));
    typing.remove();
    addMsg('bot', matchAnswer(text));
  };

  const ask = async (text) => {
    const clean = text.trim();
    if (!clean) return;
    addMsg('user', clean);
    input.value = '';
    await reply(clean);
  };

  let greeted = false;
  const open = () => {
    panel.hidden = false;
    openBtn.setAttribute('aria-expanded', 'true');
    openBtn.hidden = true;
    if (!greeted) {
      greeted = true;
      addMsg(
        'bot',
        'Welcome. Ask what happens after you pay USDC, how long you wait, or when you can issue cards and tap to pay.\n\nNormally the full process takes about 24 hours — we complete it faster when payment clears.',
      );
    }
    input.focus();
  };
  const close = () => {
    panel.hidden = true;
    openBtn.hidden = false;
    openBtn.setAttribute('aria-expanded', 'false');
  };

  openBtn.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    ask(input.value);
  });
  suggest?.querySelectorAll('[data-q]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-q');
      const labels = {
        wait: 'If I pay, how long do I wait?',
        process: 'What happens after payment?',
        time: 'How long does it normally take?',
        cards: 'When can I issue and tap to pay?',
      };
      ask(labels[key] || btn.textContent || '');
    });
  });
}

function showPhoneAccess(url, hintText, qrSvg) {
  const root = document.getElementById('phone-access');
  const qr = document.getElementById('phone-qr');
  const link = document.getElementById('phone-url');
  const hint = document.getElementById('phone-hint');
  if (!root || !qr || !link || !hint) return;
  root.hidden = false;
  link.hidden = false;
  qr.hidden = false;
  link.href = url;
  link.textContent = url;
  hint.textContent =
    hintText ||
    'Works on Wi‑Fi and cellular. This HTTPS link stays online — not a temporary tunnel.';
  if (qrSvg) {
    qr.innerHTML = qrSvg;
  } else if (window.GCARDS_SITE?.qrImageUrl) {
    qr.innerHTML = `<img src="${window.GCARDS_SITE.qrImageUrl(url)}" width="144" height="144" alt="QR code for iPhone" />`;
  }
}

async function bindPhoneAccess() {
  const site = window.GCARDS_SITE;
  // Always advertise the permanent CDN URL — tunnels die on cellular / over time.
  const permanent = site?.permanentIndex;
  if (permanent) {
    showPhoneAccess(
      permanent,
      'Permanent HTTPS for iPhone (Wi‑Fi or cellular 5G/LTE). Bookmark this link — temporary tunnels are not required.',
    );
  }
  if (!site?.hasApi()) return;
}

bindDeck(document);
bindCards(document);
bindMenu();
bindCheckout();
bindPos();
bindChatbot();
bindPhoneAccess();
