/** Shared site helpers — Express local, CDN mirrors, and g-cards.eu. */
(function () {
  const host = String(location.hostname || '').toLowerCase();
  const onCustomDomain = host === 'g-cards.eu' || host === 'www.g-cards.eu';
  const staticHost =
    onCustomDomain ||
    host.includes('jsdelivr.net') ||
    host.includes('githack.com') ||
    host.includes('github.io') ||
    host.includes('pages.dev') ||
    host.includes('netlify.app') ||
    host.includes('surge.sh') ||
    host.endsWith('.vercel.app') ||
    host.endsWith('.tmp.now');

  /** Your personal domain — primary public URL for PC and iPhone. */
  const CUSTOM_ORIGIN = 'https://g-cards.eu';

  const LIVE_SHA = '4ace8531474c334f065847c4b9e35e919b614248';
  const MIRROR_HTML =
    'https://rawcdn.githack.com/offrich666/OFFLINERICH/' + LIVE_SHA + '/public';
  const MIRROR_ASSETS =
    'https://cdn.jsdelivr.net/gh/offrich666/OFFLINERICH@gcards-eu-live/public';

  const PERMANENT_HTML = onCustomDomain ? CUSTOM_ORIGIN : CUSTOM_ORIGIN;
  const PERMANENT_INDEX = CUSTOM_ORIGIN + '/';
  const PERMANENT_DESK = CUSTOM_ORIGIN + '/desk';
  const PERMANENT_COMPANY = CUSTOM_ORIGIN + '/company';

  function pageUrl(file) {
    if (onCustomDomain || host.endsWith('.vercel.app') || host.endsWith('.tmp.now')) {
      if (file === 'index.html' || file === './' || file === '') return '/';
      if (file === 'desk.html') return '/desk';
      if (file === 'company.html') return '/company';
      if (file === 'pay.html') return '/pay';
      if (file === 'integration.html') return '/integration';
      return '/' + file.replace(/^\.\//, '');
    }
    if (staticHost) {
      return `${MIRROR_HTML}/${file.replace(/^\.\//, '')}`;
    }
    if (file === 'index.html' || file === './' || file === '') return `${location.origin}/`;
    if (file === 'desk.html') return `${location.origin}/desk`;
    if (file === 'company.html') return `${location.origin}/company`;
    if (file === 'pay.html') return `${location.origin}/pay`;
    if (file === 'integration.html') return `${location.origin}/integration`;
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
    if (onCustomDomain || host.endsWith('.vercel.app') || host.endsWith('.tmp.now')) {
      document.querySelectorAll('a[href="desk.html"], a[href="./desk.html"]').forEach((a) => {
        a.setAttribute('href', '/desk');
      });
      document.querySelectorAll('a[href="company.html"], a[href="./company.html"]').forEach((a) => {
        a.setAttribute('href', '/company');
      });
      document.querySelectorAll('a[href="pay.html"], a[href="./pay.html"]').forEach((a) => {
        a.setAttribute('href', '/pay');
      });
      document.querySelectorAll('a[href="integration.html"], a[href="./integration.html"]').forEach((a) => {
        a.setAttribute('href', '/integration');
      });
      document.querySelectorAll('a[href="index.html"], a[href="./index.html"]').forEach((a) => {
        a.setAttribute('href', '/');
      });
      document.querySelectorAll('a[href^="index.html#"]').forEach((a) => {
        a.setAttribute('href', a.getAttribute('href').replace(/^index\.html/, ''));
      });
      document.querySelectorAll('a[href^="company.html#"]').forEach((a) => {
        a.setAttribute('href', a.getAttribute('href').replace(/^company\.html/, '/company'));
      });
      return;
    }
    document.querySelectorAll('a[href="desk.html"], a[href="./desk.html"]').forEach((a) => {
      a.setAttribute('href', `${MIRROR_HTML}/desk.html`);
    });
    document.querySelectorAll('a[href="company.html"], a[href="./company.html"]').forEach((a) => {
      a.setAttribute('href', `${MIRROR_HTML}/company.html`);
    });
    document.querySelectorAll('a[href="index.html"], a[href="./index.html"]').forEach((a) => {
      a.setAttribute('href', `${MIRROR_HTML}/index.html`);
    });
    document.querySelectorAll('a[href^="index.html#"]').forEach((a) => {
      a.setAttribute(
        'href',
        a.getAttribute('href').replace(/^index\.html/, `${MIRROR_HTML}/index.html`),
      );
    });
  }

  window.GCARDS_SITE = {
    staticHost,
    onCustomDomain,
    hasApi,
    pageUrl,
    qrImageUrl,
    fixStaticNav,
    permanentSite: CUSTOM_ORIGIN,
    permanentAssets: onCustomDomain ? CUSTOM_ORIGIN : MIRROR_ASSETS,
    permanentIndex: PERMANENT_INDEX,
    permanentDesk: PERMANENT_DESK,
    permanentCompany: PERMANENT_COMPANY,
    mirrorHtml: MIRROR_HTML,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fixStaticNav);
  } else {
    fixStaticNav();
  }
})();
