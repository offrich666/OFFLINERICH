const PRICE_USD = 1340;

function cardBase(key) {
  const narrow = window.matchMedia('(max-width: 960px)').matches;
  if (narrow) {
    return {
      visa: 'translate3d(-22px, -28px, 20px) rotateZ(-8deg)',
      master: 'translate3d(0, 4px, 60px) rotateZ(1deg)',
      amex: 'translate3d(22px, 36px, 100px) rotateZ(9deg)',
    }[key];
  }
  return {
    visa: 'translate3d(-36px, -40px, 20px) rotateZ(-10deg)',
    master: 'translate3d(0, 8px, 70px) rotateZ(2deg)',
    amex: 'translate3d(34px, 52px, 120px) rotateZ(11deg)',
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
        'Payment request recorded. We will confirm and activate the G Cards EU Frankfurt package.';
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

bindDeck(document);
bindCards(document);
bindMenu();
bindCheckout();
