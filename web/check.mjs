#!/usr/bin/env node
// Post-build validation. Runs against the generated site in ../website and
// fails loudly, so a broken internal link or a missing canonical never reaches
// production quietly.
//
//   node web/check.mjs

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE } from './lib/layout.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', 'website');

const problems = [];
const warn = [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(OUT);
// Google Search Console sahiplik dosyası bir SAYFA değildir: tek satır düz
// metin, .html uzantısıyla servis edilmesi Google'ın şartı. Denetimden muaf.
const htmls = files.filter((f) => f.endsWith('.html') && !/\/google[0-9a-f]+\.html$/.test(f));

// Which URL paths actually exist on disk.
const exists = (urlPath) => {
  const clean = urlPath.split('#')[0].split('?')[0];
  if (clean === '/') return existsSync(join(OUT, 'index.html'));
  const asFile = join(OUT, clean.replace(/^\//, ''));
  if (existsSync(asFile) && statSync(asFile).isFile()) return true;
  return existsSync(join(asFile, 'index.html'));
};

const titles = new Map();
const descs = new Map();

for (const file of htmls) {
  const html = readFileSync(file, 'utf8');
  const rel = '/' + file.slice(OUT.length + 1).replace(/index\.html$/, '');
  const label = rel === '/404.html' ? rel : rel;

  // --- head essentials ---
  const title = html.match(/<title>(.*?)<\/title>/s)?.[1];
  const desc = html.match(/<meta name="description" content="(.*?)"/s)?.[1];
  const canon = html.match(/<link rel="canonical" href="(.*?)"/)?.[1];
  const noindex = html.includes('name="robots" content="noindex');

  if (!title) problems.push(`${label}: <title> yok`);
  if (!desc) problems.push(`${label}: meta description yok`);
  if (!canon) problems.push(`${label}: canonical yok`);
  if (canon && !canon.startsWith(SITE)) problems.push(`${label}: canonical üretim host'unda değil (${canon})`);
  if (title && title.length > 70) warn.push(`${label}: title ${title.length} karakter (>70)`);
  if (desc && desc.length > 165) warn.push(`${label}: description ${desc.length} karakter (>165)`);

  if (!noindex) {
    if (title) {
      if (titles.has(title)) problems.push(`${label}: title, ${titles.get(title)} ile aynı`);
      else titles.set(title, label);
    }
    if (desc) {
      if (descs.has(desc)) problems.push(`${label}: description, ${descs.get(desc)} ile aynı`);
      else descs.set(desc, label);
    }
  }

  // --- headings ---
  const h1s = html.match(/<h1[\s>]/g)?.length ?? 0;
  if (h1s !== 1) problems.push(`${label}: h1 sayısı ${h1s}`);

  // --- language ---
  const lang = html.match(/<html lang="(\w\w)"/)?.[1];
  if (!lang) problems.push(`${label}: html lang yok`);

  // --- hreflang pairs must resolve ---
  for (const m of html.matchAll(/<link rel="alternate" hreflang="[^"]+" href="([^"]+)"/g)) {
    const p = m[1].replace(SITE, '');
    if (!exists(p)) problems.push(`${label}: hreflang hedefi yok → ${p}`);
  }

  // --- internal links resolve ---
  for (const m of html.matchAll(/href="(\/[^"#][^"]*)"/g)) {
    const href = m[1];
    if (href.startsWith('//')) continue;
    if (!exists(href)) problems.push(`${label}: kırık iç link → ${href}`);
  }

  // --- assets resolve ---
  for (const m of html.matchAll(/(?:src|href)="(\/(?:img|fonts|styles\.css|app\.js)[^"]*)"/g)) {
    if (!exists(m[1])) problems.push(`${label}: eksik dosya → ${m[1]}`);
  }

  // --- images carry dimensions + alt (layout stability + a11y) ---
  for (const m of html.matchAll(/<img\s([^>]*)>/g)) {
    const attrs = m[1];
    if (!/alt="/.test(attrs)) problems.push(`${label}: alt'sız <img>`);
    if (!/width="/.test(attrs) || !/height="/.test(attrs))
      problems.push(`${label}: width/height'sız <img> (CLS riski)`);
  }

  // --- structured data parses ---
  for (const m of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) {
    try {
      JSON.parse(m[1].replace(/\\u003c/g, '<'));
    } catch (e) {
      problems.push(`${label}: JSON-LD parse hatası — ${e.message}`);
    }
  }

  // --- external links are safe ---
  for (const m of html.matchAll(/<a\s[^>]*href="https?:\/\/[^"]*"[^>]*>/g)) {
    if (m[0].includes('target="_blank"') && !m[0].includes('rel=')) {
      problems.push(`${label}: target=_blank ama rel yok`);
    }
  }
}

// --- sitemap ---
const sitemap = readFileSync(join(OUT, 'sitemap.xml'), 'utf8');
const locs = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
for (const loc of locs) {
  if (!loc.startsWith(SITE)) problems.push(`sitemap: üretim dışı URL ${loc}`);
  if (!exists(loc.replace(SITE, ''))) problems.push(`sitemap: var olmayan URL ${loc}`);
}
// Every indexable page should be listed exactly once.
const indexable = htmls.filter(
  (f) => !readFileSync(f, 'utf8').includes('name="robots" content="noindex'),
);
if (locs.length !== indexable.length) {
  problems.push(`sitemap: ${locs.length} URL var ama ${indexable.length} indekslenebilir sayfa üretildi`);
}
if (new Set(locs).size !== locs.length) problems.push('sitemap: yinelenen URL');

if (!readFileSync(join(OUT, 'robots.txt'), 'utf8').includes('Sitemap:'))
  problems.push('robots.txt: Sitemap satırı yok');

// ---------------------------------------------------------------------------
console.log(`· ${htmls.length} sayfa denetlendi`);
for (const w of warn.slice(0, 20)) console.log(`  ⚠ ${w}`);
if (warn.length > 20) console.log(`  ⚠ …ve ${warn.length - 20} uyarı daha`);
if (problems.length) {
  console.log(`\n✗ ${problems.length} sorun:`);
  for (const p of problems.slice(0, 40)) console.log(`  ✗ ${p}`);
  if (problems.length > 40) console.log(`  … ve ${problems.length - 40} tane daha`);
  process.exit(1);
}
console.log('✓ tüm kontroller geçti');
