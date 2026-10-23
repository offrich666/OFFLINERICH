/** Shared site helpers — works on Express and permanent static CDN hosts. */
(function () {
  const host = String(location.hostname || '').toLowerCase();
  const staticHost =
    host.includes('jsdelivr.net') ||
    host.includes('githack.com') ||
    host.includes('github.io') ||
    host.includes('pages.dev') ||
    host.includes('netlify.app') ||
    host.includes('surge.sh');

  /**
   * Permanent HTTPS pages (raw.githack serves HTML as text/html).
   * Assets load from jsDelivr via <base> on those hosts.
   * Works on iPhone Wi‑Fi and cellular — not a temporary tunnel.
   */
  const PERMANENT_HTML =
    'https://raw.githack.com/offrich666/OFFLINERICH/gcards-eu-live/public';
  const PERMANENT_ASSETS =
    'https://cdn.jsdelivr.net/gh/offrich666/OFFLINERICH@gcards-eu-live/public';

  function pageUrl(file) {
    if (staticHost) {
      return `${PERMANENT_HTML}/${file.replace(/^\.\//, '')}`;
    }
    if (file === 'index.html' || file === './' || file === '') return `${location.origin}/`;
    if (file === 'desk.html') return `${location.origin}/desk`;
    return `${location.origin}/${file.replace(/^\.\//, '')}`;
  }

  function hasApi() {
    return !staticHost;
  }

  function qrImageUrl(text) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=8&data=${encodeURIComponent(text)}`;
  }

  function fixStaticNav() {
    if (!staticHost) return;
    document.querySelectorAll('a[href="desk.html"], a[href="./desk.html"]').forEach((a) => {
      a.setAttribute('href', `${PERMANENT_HTML}/desk.html`);
    });
    document.querySelectorAll('a[href="index.html"], a[href="./index.html"]').forEach((a) => {
      a.setAttribute('href', `${PERMANENT_HTML}/index.html`);
    });
    document.querySelectorAll('a[href^="index.html#"]').forEach((a) => {
      a.setAttribute('href', a.getAttribute('href').replace(/^index\.html/, `${PERMANENT_HTML}/index.html`));
    });
  }

  window.GCARDS_SITE = {
    staticHost,
    hasApi,
    pageUrl,
    qrImageUrl,
    fixStaticNav,
    permanentSite: PERMANENT_HTML,
    permanentAssets: PERMANENT_ASSETS,
    permanentIndex: `${PERMANENT_HTML}/index.html`,
    permanentDesk: `${PERMANENT_HTML}/desk.html`,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fixStaticNav);
  } else {
    fixStaticNav();
  }
})();
