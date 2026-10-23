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

  /** Permanent HTTPS origin (jsDelivr → gcards-eu-live branch). Works on Wi‑Fi and cellular. */
  const PERMANENT_SITE =
    'https://cdn.jsdelivr.net/gh/offrich666/OFFLINERICH@gcards-eu-live/public';

  function pageUrl(file) {
    if (staticHost) {
      const base = location.href.replace(/\/[^/]*$/, '/');
      return new URL(file, base).href;
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

  window.GCARDS_SITE = {
    staticHost,
    hasApi,
    pageUrl,
    qrImageUrl,
    permanentSite: PERMANENT_SITE,
    permanentIndex: `${PERMANENT_SITE}/index.html`,
    permanentDesk: `${PERMANENT_SITE}/desk.html`,
  };
})();
