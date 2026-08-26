// Privacy, Terms/EULA, Support and the Parent's Guide.
//
// The wording of these pages is compliance surface — App Store review has read
// them, and the store listing links to them. So the build re-skins them and
// does not rewrite them: the bodies in web/legal/*.html are the originals,
// lifted out of the previous site verbatim. Edit those files to change the text.

import { page, ldBreadcrumb, ldFaq, SITE } from '../lib/layout.mjs';
import { crumbs, band } from '../lib/ui.mjs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const readLegal = (name) =>
  readFileSync(join(HERE, '..', 'legal', `${name}.html`), 'utf8');

const PAGES = {
  gizlilik: {
    path: '/gizlilik/',
    crumb: 'Gizlilik',
    title: 'Gizlilik Politikası | CrossOver Football',
    description:
      'CrossOver Football hangi verileri topluyor, nasıl kullanıyor ve nasıl koruyor? Hesap silme, reklam kimliği ve üçüncü taraf hizmetler hakkında bilgi.',
  },
  kosullar: {
    path: '/kosullar/',
    crumb: 'Kullanım Koşulları',
    title: 'Kullanım Koşulları (EULA) | CrossOver Football',
    description:
      'CrossOver Football kullanım koşulları: hesap ve yaş şartı, kullanıcı içeriği kuralları, sıfır tolerans politikası, abonelikler ve fesih.',
  },
  destek: {
    path: '/destek/',
    crumb: 'Destek',
    title: 'Destek | CrossOver Football',
    description:
      'CrossOver Football destek sayfası: sık sorulan sorular, satın alım sorunları, hesap silme ve iletişim adresi.',
  },
  ebeveyn: {
    path: '/ebeveyn/',
    crumb: 'Ebeveyn Rehberi',
    title: 'Ebeveyn Rehberi | CrossOver Football',
    description:
      'CrossOver Football’daki sosyal özellikler, engelleme ve şikâyet araçları, uygulama içi satın alımlar ve reklamlar hakkında ebeveynler için rehber.',
  },
};

export function legalPage(name) {
  const meta = PAGES[name];
  const raw = readLegal(name);

  // The original bodies open with <h1> and a "Son güncelleme" line; both belong
  // in the page header now, so they are pulled out rather than duplicated.
  const h1 = raw.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1] ?? meta.crumb;
  const updated = raw.match(/<p class="updated">(.*?)<\/p>/s)?.[1] ?? '';
  const content = raw
    .replace(/<h1[^>]*>.*?<\/h1>/s, '')
    .replace(/<p class="updated">.*?<\/p>/s, '')
    .trim();

  const body = `
${crumbs([
  ['Ana Sayfa', '/'],
  [meta.crumb, meta.path],
])}
<section class="wrap section-tight">
<div class="head" style="margin-bottom:26px">
<span class="eyebrow reveal">Yasal</span>
<h1 class="reveal d1">${h1}</h1>
${updated ? `<p class="lede reveal d2">${updated}</p>` : ''}
</div>
</section>
<section class="section-tight" style="padding-top:0">
<div class="wrap wrap-narrow">
<div class="panel pad-lg prose reveal">${content}</div>
</div>
</section>
${band('tr', { title: 'Sorun devam ediyorsa', lede: 'Destek adresinden yaz, 1-2 iş günü içinde dönelim.' })}`;

  return page({
    lang: 'tr',
    path: meta.path,
    title: meta.title,
    description: meta.description,
    body,
    jsonld: [
      ldBreadcrumb([
        ['Ana Sayfa', '/'],
        [meta.crumb, meta.path],
      ]),
    ],
  });
}

// name + path pairs, so the builder never has to guess a route from markup.
export const LEGAL_PAGES = Object.entries(PAGES).map(([name, p]) => ({
  name,
  path: p.path,
}));

// ---------------------------------------------------------------------------
export function notFound() {
  const body = `
<section class="wrap section" style="text-align:center;padding-block:clamp(60px,12vw,140px)">
<span class="eyebrow reveal">404</span>
<h1 class="display reveal d1" style="margin:16px 0 18px">Bu top <span class="gold">auta gitti.</span></h1>
<p class="lede reveal d2" style="margin-inline:auto">Aradığın sayfa taşınmış ya da hiç var olmamış olabilir. Buradan devam edebilirsin:</p>
<div class="btn-row reveal d3" style="justify-content:center;margin-top:30px">
<a class="btn btn-primary" href="/">Ana sayfa</a>
<a class="btn btn-ghost" href="/ortak-futbolcu/">Ortak futbolcu arşivi</a>
<a class="btn btn-ghost" href="/nasil-oynanir/">Nasıl oynanır</a>
</div>
</section>`;

  return page({
    lang: 'tr',
    path: '/404.html',
    title: 'Sayfa bulunamadı (404) | CrossOver Football',
    description: 'Aradığın sayfa bulunamadı.',
    body,
    noindex: true,
    dock: false,
  });
}
