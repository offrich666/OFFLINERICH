const PRICE_USD = 1340;

function bindDeck(root) {
  const deck = root.querySelector('[data-deck]');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!deck || reduce) return;

  const scene = root.querySelector('#scene') || deck.parentElement;
  scene.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    const box = scene.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    deck.style.transform = `rotateX(${(12 - y * 10).toFixed(2)}deg) rotateY(${(-18 + x * 16).toFixed(2)}deg)`;
  });
  scene.addEventListener('pointerleave', () => {
    deck.style.transform = '';
  });
}

function bindCards(root) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.querySelectorAll('[data-card]').forEach((card) => {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    const baseVisa = 'translate3d(-18px, -28px, 40px) rotateZ(-6deg)';
    const baseMaster = 'translate3d(12px, 20px, 80px) rotateZ(4deg)';
    const base = card.classList.contains('visa') ? baseVisa : baseMaster;

    const setTilt = (clientX, clientY) => {
      if (reduce || card.classList.contains('flipped')) return;
      const box = card.getBoundingClientRect();
      const x = (clientX - box.left) / box.width - 0.5;
      const y = (clientY - box.top) / box.height - 0.5;
      card.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(0)}%`);
      card.style.transform = `${base} rotateX(${(-y * 12).toFixed(2)}deg) rotateY(${(x * 14).toFixed(2)}deg)`;
    };

    const resetTilt = () => {
      card.style.transform = base;
    };

    card.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch' && !dragging) return;
      setTilt(event.clientX, event.clientY);
    });
    card.addEventListener('pointerleave', resetTilt);
    card.addEventListener('pointerdown', (event) => {
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      card.setPointerCapture(event.pointerId);
    });
    card.addEventListener('pointerup', (event) => {
      const dx = Math.abs(event.clientX - startX);
      const dy = Math.abs(event.clientY - startY);
      dragging = false;
      if (dx < 12 && dy < 12) {
        card.classList.toggle('flipped');
        resetTilt();
      } else {
        resetTilt();
      }
    });
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        card.classList.toggle('flipped');
        resetTilt();
      }
    });
    resetTilt();
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
        'Payment request recorded. We will confirm and activate the GG-CARD.EU Frankfurt infrastructure package.';
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
