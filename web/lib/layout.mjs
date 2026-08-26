// Page shell: <head> metadata, JSON-LD, nav, footer. Everything the crawler
// needs is in the served HTML — there is no client-side rendering anywhere on
// this site, so Googlebot sees the finished page on the first byte.

export const SITE = 'https://crossoverfootball.com';
export const BRAND = 'CrossOver Football';
export const APP_STORE =
  'https://apps.apple.com/tr/app/crossover-football/id6778542426';
export const APP_STORE_ID = '6778542426';
// Public support address. Also the contact in the Organization structured data,
// so it has to be a mailbox that is actually read.
export const SUPPORT_MAIL = 'info@crossoverfootball.com';

// Google AdSense site verification for the publisher account tied to this
// domain (and app-ads.txt for AdMob). Async, so it never blocks first paint.
// Safe to drop once the account no longer needs the on-page tag.
export const ADSENSE_CLIENT = 'ca-pub-5118403349234305';

// Android is not on Google Play yet. Until it is, the site says "yakında" and
// never renders a Play button that would 404 the visitor.
export const ANDROID_LIVE = false;

export const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// ---------------------------------------------------------------------------
// Icons — thin, precise line work. No icon-font dependency.
// ---------------------------------------------------------------------------
const I = (d, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}${extra}</svg>`;

export const icons = {
  play: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.6c0-.86.94-1.39 1.67-.94l9.4 5.9c.7.44.7 1.45 0 1.89l-9.4 5.9A1.1 1.1 0 0 1 8 17.4V5.6Z"/></svg>`,
  bolt: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.6 2 5 13.2h5.1L9.3 22l8.9-11.6h-5.3L13.6 2Z"/></svg>`,
  check: I(`<path d="M20 6.5 9.5 17 4 11.6"/>`),
  clock: I(`<circle cx="12" cy="12" r="9"/><path d="M12 7.2V12l3.2 1.9"/>`),
  users: I(`<path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19"/><circle cx="10" cy="7.5" r="3.2"/><path d="M20 19v-1.4a3.5 3.5 0 0 0-2.6-3.4M15.6 4.7a3.2 3.2 0 0 1 0 5.9"/>`),
  bot: I(`<rect x="4.5" y="7.5" width="15" height="11.5" rx="3"/><path d="M12 7.5V4.2M9.3 12.6h.01M14.7 12.6h.01M10 16h4M2.2 12.5h2.3M19.5 12.5h2.3"/>`),
  globe: I(`<circle cx="12" cy="12" r="9"/><path d="M3.2 12h17.6M12 3.1c2.4 2.6 2.4 15.2 0 17.8M12 3.1c-2.4 2.6-2.4 15.2 0 17.8"/>`),
  letter: I(`<path d="M5.5 19 12 5l6.5 14M8.2 14.4h7.6"/>`),
  trophy: I(`<path d="M7 4.5h10v4.2a5 5 0 0 1-10 0V4.5Z"/><path d="M7 6.2H4.6a2.4 2.4 0 0 0 2.4 4.6M17 6.2h2.4a2.4 2.4 0 0 1-2.4 4.6M10 13.7V17h4v-3.3M8 20h8"/>`),
  shield: I(`<path d="M12 3.2 5 5.9v5.3c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V5.9L12 3.2Z"/><path d="M9.3 12.2 11.3 14l3.6-3.7"/>`),
  search: I(`<circle cx="11" cy="11" r="6.5"/><path d="M16 16l3.8 3.8"/>`),
  spark: I(`<path d="M12 3.4 13.7 9l5.6 1.7-5.6 1.7L12 18l-1.7-5.6L4.7 10.7 10.3 9 12 3.4Z"/>`),
  arrow: I(`<path d="M4.6 12h14M13.2 6.4 18.8 12l-5.6 5.6"/>`),
  book: I(`<path d="M4.5 5.2A2 2 0 0 1 6.5 3.2H19v15.6H6.5a2 2 0 0 0-2 2V5.2Z"/><path d="M4.5 18.8a2 2 0 0 1 2-2H19"/>`),
  apple: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.7 12.6c0-2.6 2.1-3.9 2.2-4-1.2-1.7-3-2-3.7-2-1.6-.16-3.1.93-3.9.93-.8 0-2-.9-3.3-.88-1.7.02-3.2 1-4.1 2.5-1.7 3-.45 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.45 1.2-.05 1.7-.78 3.1-.78 1.4 0 1.9.78 3.1.76 1.3-.02 2.1-1.2 2.9-2.4.9-1.3 1.3-2.6 1.3-2.66-.03-.01-2.5-.96-2.5-3.8ZM14.5 5.7c.66-.8 1.1-1.9 1-3-.95.04-2.1.63-2.8 1.42-.6.7-1.15 1.8-1 2.9 1.06.08 2.14-.54 2.8-1.32Z"/></svg>`,
  android: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.6 9.5H6.4a.6.6 0 0 0-.6.6v6.7c0 .9.7 1.6 1.6 1.6h.7v2.3c0 .72.58 1.3 1.3 1.3s1.3-.58 1.3-1.3v-2.3h2.6v2.3c0 .72.58 1.3 1.3 1.3s1.3-.58 1.3-1.3v-2.3h.7c.9 0 1.6-.7 1.6-1.6v-6.7a.6.6 0 0 0-.6-.6ZM3.9 9.4c-.72 0-1.3.58-1.3 1.3v4.7a1.3 1.3 0 1 0 2.6 0v-4.7c0-.72-.58-1.3-1.3-1.3Zm16.2 0c-.72 0-1.3.58-1.3 1.3v4.7a1.3 1.3 0 1 0 2.6 0v-4.7c0-.72-.58-1.3-1.3-1.3ZM15.3 3.5l.9-1.6a.3.3 0 0 0-.52-.3l-.93 1.66A6.2 6.2 0 0 0 12 2.7c-.98 0-1.9.19-2.73.53L8.34 1.6a.3.3 0 0 0-.52.3l.9 1.6A5.3 5.3 0 0 0 5.9 8.1h12.2a5.3 5.3 0 0 0-2.8-4.6ZM9.4 6.2a.6.6 0 1 1 0-1.2.6.6 0 0 1 0 1.2Zm5.2 0a.6.6 0 1 1 0-1.2.6.6 0 0 1 0 1.2Z"/></svg>`,
};

// ---------------------------------------------------------------------------
// Navigation. Same links in the served HTML on every page — no JS-built menus,
// so every route is reachable by a crawler following plain <a href>.
// ---------------------------------------------------------------------------
const NAV = {
  tr: [
    ['/nasil-oynanir/', 'Nasıl Oynanır'],
    ['/oyun-modlari/', 'Oyun Modları'],
    ['/ortak-futbolcu/', 'Ortak Futbolcular'],
    ['/rehber/', 'Rehber'],
    ['/sss/', 'SSS'],
  ],
  en: [
    ['/en/how-to-play/', 'How to Play'],
    ['/en/game-modes/', 'Game Modes'],
    ['/en/faq/', 'FAQ'],
  ],
};

const T = {
  tr: {
    download: 'Ücretsiz İndir',
    skip: 'İçeriğe geç',
    menu: 'Menüyü aç/kapat',
    home: 'Ana Sayfa',
    game: 'Oyun',
    learn: 'Keşfet',
    legal: 'Yasal',
    about:
      'İki takım seçilir, ikisinde de forma giymiş ortak futbolcuyu ilk bulan turu kazanır. Gerçek transfer verisiyle, gerçek rakiplere karşı.',
    rights: 'Tüm hakları saklıdır.',
    dockCta: 'Ücretsiz Oyna',
  },
  en: {
    download: 'Download Free',
    skip: 'Skip to content',
    menu: 'Toggle menu',
    home: 'Home',
    game: 'Game',
    learn: 'Explore',
    legal: 'Legal',
    about:
      'Two clubs are drawn. The first player to name a footballer who wore both shirts takes the round. Real transfer data, real opponents.',
    rights: 'All rights reserved.',
    dockCta: 'Play Free',
  },
};

function nav(lang, path, altPath) {
  const t = T[lang];
  const links = NAV[lang]
    .map(
      ([href, label]) =>
        `<a href="${href}"${path === href ? ' aria-current="page"' : ''}>${label}</a>`,
    )
    .join('');
  const dl = lang === 'tr' ? '/indir/' : '/en/download/';
  // The language switch points at the counterpart page when one exists, and at
  // the other tree's home page when it does not — never at a 404.
  const trHref = lang === 'tr' ? path : altPath || '/';
  const enHref = lang === 'en' ? path : altPath || '/en/';
  return `<header class="nav">
<div class="wrap bar">
<a class="brand" href="${lang === 'tr' ? '/' : '/en/'}" aria-label="${BRAND}">
<img src="/img/logo-mark.png" width="34" height="34" alt="" />
<b>CROSS<i>OVER</i></b>
</a>
<nav class="nav-links" id="menu" aria-label="${lang === 'tr' ? 'Ana menü' : 'Main'}">
${links}
<span class="menu-cta"><a class="btn btn-primary" href="${dl}">${t.download}</a></span>
</nav>
<div class="nav-right">
<div class="lang" role="group" aria-label="${lang === 'tr' ? 'Dil' : 'Language'}">
<a href="${trHref}" hreflang="tr"${lang === 'tr' ? ' aria-current="true"' : ''}>TR</a>
<a href="${enHref}" hreflang="en"${lang === 'en' ? ' aria-current="true"' : ''}>EN</a>
</div>
<a class="btn btn-primary btn-sm" href="${dl}">${t.download}</a>
<button class="burger" id="burger" aria-label="${t.menu}" aria-expanded="false" aria-controls="menu"><span></span><span></span><span></span></button>
</div>
</div>
</header>`;
}

function footer(lang) {
  const t = T[lang];
  const cols =
    lang === 'tr'
      ? [
          [
            t.game,
            [
              ['/nasil-oynanir/', 'Nasıl oynanır'],
              ['/oyun-modlari/', 'Oyun modları'],
              ['/indir/', 'Ücretsiz indir'],
              ['/sss/', 'Sıkça sorulan sorular'],
            ],
          ],
          [
            t.learn,
            [
              ['/ortak-futbolcu-oyunu/', 'Ortak futbolcu oyunu'],
              ['/futbolcu-bilme-oyunu/', 'Futbolcu bilme oyunu'],
              ['/futbol-bilgi-oyunu/', 'Futbol bilgi oyunu'],
              ['/ortak-futbolcu/', 'Kulüp eşleşmeleri'],
              ['/rehber/', 'Futbol rehberi'],
            ],
          ],
          [
            t.legal,
            [
              ['/gizlilik/', 'Gizlilik politikası'],
              ['/kosullar/', 'Kullanım koşulları'],
              ['/ebeveyn/', 'Ebeveyn rehberi'],
              ['/destek/', 'Destek'],
            ],
          ],
        ]
      : [
          [
            t.game,
            [
              ['/en/how-to-play/', 'How to play'],
              ['/en/game-modes/', 'Game modes'],
              ['/en/download/', 'Download free'],
              ['/en/faq/', 'FAQ'],
            ],
          ],
          [
            t.learn,
            [
              ['/', 'Türkçe ana sayfa'],
              ['/ortak-futbolcu/', 'Club pair archive'],
            ],
          ],
          [
            t.legal,
            [
              ['/gizlilik/', 'Privacy policy'],
              ['/kosullar/', 'Terms of use'],
              ['/destek/', 'Support'],
            ],
          ],
        ];

  return `<footer class="foot">
<div class="wrap">
<div class="foot-grid">
<div>
<a class="brand" href="${lang === 'tr' ? '/' : '/en/'}"><img src="/img/logo-mark.png" width="34" height="34" alt="" /><b>CROSS<i>OVER</i></b></a>
<p class="about">${t.about}</p>
</div>
${cols
  .map(
    ([title, links]) => `<div>
<h4>${title}</h4>
<ul>${links.map(([h, l]) => `<li><a href="${h}">${l}</a></li>`).join('')}</ul>
</div>`,
  )
  .join('')}
</div>
<div class="foot-base">
<span>© ${new Date().getFullYear()} ${BRAND}. ${t.rights}</span>
<span>${lang === 'tr' ? 'Veri: Transfermarkt tabanlı kariyer arşivi' : 'Data: Transfermarkt-based career archive'}</span>
</div>
</div>
</footer>`;
}

// ---------------------------------------------------------------------------
// The document.
// ---------------------------------------------------------------------------
export function page({
  lang = 'tr',
  path,
  altPath = null, // same page in the other language, when it exists
  title,
  description,
  body,
  jsonld = [],
  ogImage = '/img/og-default.png',
  ogType = 'website',
  noindex = false,
  dock = true,
}) {
  const t = T[lang];
  const url = SITE + path;
  const alt = altPath ? SITE + altPath : null;
  const otherLang = lang === 'tr' ? 'en' : 'tr';

  const alternates = alt
    ? `<link rel="alternate" hreflang="${lang}" href="${url}" />
<link rel="alternate" hreflang="${otherLang}" href="${alt}" />
<link rel="alternate" hreflang="x-default" href="${SITE + (lang === 'tr' ? path : altPath)}" />`
    : '';

  const ld = jsonld
    .filter(Boolean)
    .map(
      (o) =>
        `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${url}" />
${noindex ? '<meta name="robots" content="noindex, follow" />' : '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />'}
${alternates}
<meta name="theme-color" content="#071229" />
<link rel="icon" href="/favicon.png" type="image/png" />
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png" />
<link rel="preload" as="font" type="font/woff2" href="/fonts/poppins-900-latin.woff2" crossorigin />
<link rel="preload" as="font" type="font/woff2" href="/fonts/poppins-900-latin-ext.woff2" crossorigin />
<link rel="preload" as="font" type="font/woff2" href="/fonts/poppins-500-latin.woff2" crossorigin />
<link rel="preload" as="font" type="font/woff2" href="/fonts/poppins-500-latin-ext.woff2" crossorigin />
<link rel="stylesheet" href="/styles.css" />
<meta property="og:type" content="${ogType}" />
<meta property="og:site_name" content="${BRAND}" />
<meta property="og:locale" content="${lang === 'tr' ? 'tr_TR' : 'en_US'}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${SITE}${ogImage}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="${esc(BRAND)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${SITE}${ogImage}" />
<meta name="apple-itunes-app" content="app-id=${APP_STORE_ID}" />
${ld}
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}" crossorigin="anonymous"></script>
</head>
<body>
<a class="skip" href="#main">${t.skip}</a>
<div class="pitch" aria-hidden="true"></div>
${nav(lang, path, altPath)}
<main id="main">
${body}
</main>
${footer(lang)}
${
  dock
    ? `<div class="dock" id="dock"><a class="btn btn-primary" href="${APP_STORE}" rel="noopener" data-ev="dock_store_click">${icons.apple} ${t.dockCta}</a></div>`
    : ''
}
<script src="/app.js" defer></script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Structured data helpers. Only claims that are visible on the page and true:
// no invented ratings, no invented review counts, no fake offers.
// ---------------------------------------------------------------------------
export const ldOrganization = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE}/#organization`,
  name: BRAND,
  url: SITE,
  logo: `${SITE}/img/logo-mark.png`,
  email: SUPPORT_MAIL,
  sameAs: [APP_STORE],
});

export const ldWebSite = (lang) => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE}/#website`,
  name: BRAND,
  url: SITE,
  inLanguage: lang === 'tr' ? 'tr-TR' : 'en-US',
  publisher: { '@id': `${SITE}/#organization` },
});

// The app itself: a video game that is also a mobile application. Free to
// download with optional in-app purchases — that is a real, stated offer.
export const ldApp = (lang) => ({
  '@context': 'https://schema.org',
  '@type': ['VideoGame', 'MobileApplication'],
  '@id': `${SITE}/#app`,
  name: BRAND,
  url: SITE,
  description:
    lang === 'tr'
      ? 'İki kulüpte de forma giymiş ortak futbolcuyu rakibinden önce bulduğun, gerçek zamanlı iki kişilik futbol bilgi oyunu.'
      : 'A real-time two-player football knowledge game: name the footballer who played for both clubs before your opponent does.',
  image: `${SITE}/img/og-default.png`,
  applicationCategory: 'GameApplication',
  applicationSubCategory: 'Trivia',
  genre: ['Trivia', 'Sports', 'Multiplayer'],
  gamePlatform: 'iOS',
  operatingSystem: 'iOS 15.1+',
  playMode: ['MultiPlayer', 'SinglePlayer'],
  inLanguage: ['tr', 'en'],
  installUrl: APP_STORE,
  downloadUrl: APP_STORE,
  publisher: { '@id': `${SITE}/#organization` },
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'TRY',
    availability: 'https://schema.org/InStock',
    url: APP_STORE,
  },
});

export const ldBreadcrumb = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, href], i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name,
    item: SITE + href,
  })),
});

export const ldFaq = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: items.map(([q, a]) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') },
  })),
});
