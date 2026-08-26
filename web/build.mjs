#!/usr/bin/env node
// Renders the whole site into ../website/, which is exactly what gets rsynced
// to the server. Static HTML end to end: no build step runs in production, no
// JavaScript is needed to see any content, and every route is a real directory
// with a real index.html behind it.
//
//   node web/build.mjs
//
// Data comes from web/data/football.json (see extract.mjs). Assets come from
// web/static/. Nothing is fetched at build time.

import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  cpSync,
  existsSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SITE } from './lib/layout.mjs';
import * as tr from './pages/tr.mjs';
import * as seo from './pages/seo.mjs';
import * as guides from './pages/guides.mjs';
import * as pairsPage from './pages/pairs.mjs';
import * as en from './pages/en.mjs';
import { legalPage, LEGAL_PAGES } from './pages/legal.mjs';
import { notFound } from './pages/legal.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'website');

const data = JSON.parse(readFileSync(join(HERE, 'data', 'football.json'), 'utf8'));
const { clubs, totals } = data;

// ---------------------------------------------------------------------------
// Which pairings get a page.
//
// Turkish clubs are the primary market, so their pairings ship from five
// verified players up. Everything else needs twelve — a page has to be worth
// landing on, and a table of four names is not. The rest of the 525 pairings
// stay unbuilt rather than becoming thin URLs.
// ---------------------------------------------------------------------------
// Every Turkish club in the curated set counts as TR for the page threshold —
// derived from the data instead of a second hand-kept list.
const TR_CLUBS = new Set(clubs.filter((c) => c.country === 'Türkiye').map((c) => c.slug));
const isTR = (p) => TR_CLUBS.has(p.a) || TR_CLUBS.has(p.b);
const pairs = data.pairs.filter((p) => (isTR(p) && p.count >= 5) || p.count >= 12);
const pairSlugs = new Set(pairs.map((p) => p.slug));

// ---------------------------------------------------------------------------
// Safety net: the three example rounds on the home page name a player. If the
// archive does not actually record that player at both clubs, the build stops
// rather than publishing a football claim we cannot back.
// ---------------------------------------------------------------------------
const heroPairs = tr.HERO_DUELS.map((d) => {
  const pair = data.pairs.find((p) => p.slug === d.slug);
  if (!pair) throw new Error(`Hero duel: ${d.slug} eşleşmesi arşivde yok`);
  const player = pair.players.find((p) => p.name === d.answer);
  if (!player) {
    throw new Error(
      `Hero duel: ${d.answer}, ${d.slug} eşleşmesinde kayıtlı değil — cevabı düzelt`,
    );
  }
  const yr = (list) => {
    const from = Math.min(...list.map((s) => s.from ?? s.to ?? 9999));
    const to = Math.max(...list.map((s) => s.to ?? s.from ?? 0));
    return from === to ? `${from}` : `${from}–${to}`;
  };
  // Years are read off the archive, never typed by hand.
  return { ...d, note: [yr(player.a), yr(player.b)] };
});

// Pairings shown on the home page and the cluster-A landing page.
const featured = pairs
  .filter(isTR)
  .sort((a, b) => b.weight - a.weight || b.count - a.count)
  .slice(0, 12);

// ---------------------------------------------------------------------------
const written = [];
function emit(path, html, { sitemap = true, priority = 0.5, changefreq = 'monthly' } = {}) {
  const rel = path === '/404.html' ? '404.html' : join(path.replace(/^\//, ''), 'index.html');
  const dest = join(OUT, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, html);
  written.push({ path, bytes: html.length, sitemap, priority, changefreq });
}

// ---- clean: the output directory is fully generated, so it starts empty ----
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// ---- static assets ---------------------------------------------------------
cpSync(join(HERE, 'static'), OUT, { recursive: true });

// ---- Turkish ---------------------------------------------------------------
emit('/', tr.home({ totals, heroPairs, featured, clubs }), { priority: 1.0, changefreq: 'weekly' });
emit('/nasil-oynanir/', tr.howToPlay(), { priority: 0.9 });
emit('/oyun-modlari/', tr.gameModes(), { priority: 0.9 });
emit('/indir/', tr.download(), { priority: 0.9 });

emit('/ortak-futbolcu-oyunu/', seo.ortakFutbolcuOyunu({ featured, clubs, heroPairs, totals }), {
  priority: 0.9,
});
emit('/futbolcu-bilme-oyunu/', seo.futbolcuBilmeOyunu(), { priority: 0.9 });
emit('/futbol-bilgi-oyunu/', seo.futbolBilgiOyunu({ totals }), { priority: 0.9 });
emit('/sss/', seo.sss(), { priority: 0.7 });

// ---- guides ----------------------------------------------------------------
emit('/rehber/', guides.guideHub(), { priority: 0.7 });
emit('/rehber/derbi-transferleri/', guides.guideDerby({ derby: data.derby }), { priority: 0.8 });
emit(
  '/rehber/iki-takimda-da-oynayan-futbolcu-nasil-bulunur/',
  guides.guideHowToFind({ pairs, clubs }),
  { priority: 0.8 },
);
emit('/rehber/zor-ortak-futbolcu-eslesmeleri/', guides.guideHardPairs({ pairs, clubs }), {
  priority: 0.8,
});
emit('/rehber/futbol-bilgini-gelistirme/', guides.guideImprove({ totals }), { priority: 0.7 });

// ---- club pair archive -----------------------------------------------------
emit('/ortak-futbolcu/', pairsPage.pairHub(pairs, clubs, totals), { priority: 0.9, changefreq: 'weekly' });
for (const p of pairs) {
  emit(`/ortak-futbolcu/${p.slug}/`, pairsPage.pairPage(p, clubs, pairs), {
    priority: isTR(p) ? 0.7 : 0.6,
  });
}

// ---- interactive finder data ----------------------------------------------
// The tool page fetches one small JSON per selected pairing instead of one
// giant blob: ~1-2 KB per request, and only on demand. ALL extracted pairs are
// available here (875), not just the ones that earned a static page (565) —
// the tool can answer more than the archive lists.
{
  const dataDir = join(OUT, 'ortak-futbolcu', '_data');
  mkdirSync(dataDir, { recursive: true });
  const enc = (list) => (list ?? []).map((sp) => [sp.from, sp.to]);
  for (const p of data.pairs) {
    writeFileSync(
      join(dataDir, `${p.a}__${p.b}.json`),
      JSON.stringify({
        a: p.a,
        b: p.b,
        page: pairSlugs.has(p.slug),
        players: p.players.map((pl) => ({ n: pl.name, c: pl.nat, a: enc(pl.a), b: enc(pl.b) })),
      }),
    );
  }
  writeFileSync(
    join(dataDir, 'index.json'),
    JSON.stringify({
      clubs: clubs.map((c) => ({ s: c.slug, n: c.name, k: c.country })),
      pairs: data.pairs.map((p) => `${p.a}__${p.b}`),
    }),
  );
  console.log(`  · bulucu verisi: ${data.pairs.length} çift JSON'u`);
}

emit('/ortak-futbolcu-bulucu/', tr.finderTool({ totals, clubs, pairCount: data.pairs.length }), {
  priority: 0.9,
  changefreq: 'weekly',
});

// ---- English ---------------------------------------------------------------
emit('/en/', en.enHome({ totals, heroPairs }), { priority: 0.8, changefreq: 'weekly' });
emit('/en/how-to-play/', en.enHowToPlay(), { priority: 0.6 });
emit('/en/game-modes/', en.enGameModes(), { priority: 0.6 });
emit('/en/download/', en.enDownload(), { priority: 0.6 });
emit('/en/faq/', en.enFaq(), { priority: 0.5 });

// ---- legal + 404 -----------------------------------------------------------
for (const { name, path } of LEGAL_PAGES) {
  emit(path, legalPage(name), { priority: 0.3, changefreq: 'yearly' });
}
emit('/404.html', notFound(), { sitemap: false });

// ---------------------------------------------------------------------------
// sitemap.xml — only pages that are actually indexable, with the production
// host. No staging URLs can leak in: SITE is the single source.
// ---------------------------------------------------------------------------
const today = new Date().toISOString().slice(0, 10);
const urls = written
  .filter((w) => w.sitemap)
  .sort((a, b) => b.priority - a.priority || a.path.localeCompare(b.path));

writeFileSync(
  join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `<url><loc>${SITE}${u.path}</loc><lastmod>${today}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority.toFixed(1)}</priority></url>`,
  )
  .join('\n')}
</urlset>
`,
);

writeFileSync(
  join(OUT, 'robots.txt'),
  `# CrossOver Football
User-agent: *
Allow: /
Disallow: /ortak-futbolcu/_data/

Sitemap: ${SITE}/sitemap.xml
`,
);

// ---------------------------------------------------------------------------
const bytes = written.reduce((n, w) => n + w.bytes, 0);
console.log(`✓ ${written.length} sayfa yazıldı (${(bytes / 1024).toFixed(0)} KB HTML)`);
console.log(`  · ${pairs.length} kulüp eşleşmesi (${pairs.filter(isTR).length} Türkiye)`);
console.log(`  · ${urls.length} URL sitemap'te`);
console.log(`✓ çıktı: ${OUT}`);
