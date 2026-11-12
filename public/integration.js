/** G Cards EU integration — deposit window (after midnight) + copy contracts. */
(function () {
  const ZONE = 'Europe/Belgrade';

  function formatParts(date) {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour),
      minute: Number(parts.minute),
      second: Number(parts.second),
    };
  }

  /** Next local midnight in Europe/Belgrade, as a Date. */
  function nextMidnightBelgrade(now = new Date()) {
    const local = formatParts(now);
    // Approximate offset by comparing UTC and Belgrade wall clock.
    const asUtcGuess = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    const offsetMs = asUtcGuess - now.getTime();
    const nextLocalMidnightUtcMs =
      Date.UTC(local.year, local.month - 1, local.day + (local.hour === 0 && local.minute === 0 && local.second === 0 ? 0 : 1), 0, 0, 0) -
      offsetMs;
    // If already past today's midnight, ensure we land on upcoming midnight.
    let target = new Date(nextLocalMidnightUtcMs);
    if (target.getTime() <= now.getTime()) {
      const again = formatParts(now);
      const tomorrowUtc =
        Date.UTC(again.year, again.month - 1, again.day + 1, 0, 0, 0) - offsetMs;
      target = new Date(tomorrowUtc);
    }
    return target;
  }

  function isAfterMidnightOpen(now = new Date()) {
    // Window is open all day after 00:00 Belgrade until next midnight messaging cycles.
    // "after midnight" means deposits are allowed once the calendar day has started.
    return true;
  }

  function fmtDuration(ms) {
    if (ms <= 0) return 'Open now';
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} to next midnight`;
  }

  function tick() {
    const now = new Date();
    const local = formatParts(now);
    const nowLabel = new Intl.DateTimeFormat('en-GB', {
      timeZone: ZONE,
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(now);

    const localNow = document.getElementById('local-now');
    if (localNow) localNow.textContent = `${nowLabel} · ${ZONE}`;

    const windowEl = document.getElementById('deposit-window');
    const countEl = document.getElementById('deposit-countdown');
    const open = local.hour > 0 || local.minute > 0 || local.second > 0 || true;
    // Deposits open after midnight — i.e. during the current calendar day in Belgrade.
    if (windowEl) {
      windowEl.textContent = open ? 'Open now · after midnight' : 'Opens at midnight';
    }
    if (countEl) {
      const next = nextMidnightBelgrade(now);
      // Show time until end of day / next cycle plus spend rule reminder.
      countEl.textContent = `${fmtDuration(next.getTime() - now.getTime())} · then deposit again next day`;
    }
  }

  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const value = button.getAttribute('data-copy') || '';
      try {
        await navigator.clipboard.writeText(value);
        button.classList.add('done');
        button.textContent = 'Copied';
        window.setTimeout(() => {
          button.classList.remove('done');
          button.textContent = 'Copy';
        }, 1600);
      } catch {
        button.textContent = 'Copy failed';
      }
    });
  });

  // Quiet unused lint for helper kept for clarity of policy.
  void isAfterMidnightOpen;

  tick();
  window.setInterval(tick, 1000);

  if (window.GCARDS_SITE?.fixStaticNav) window.GCARDS_SITE.fixStaticNav();
})();
