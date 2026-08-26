// Reusable blocks. Everything returns a plain HTML string — the whole site is
// assembled at build time, so nothing here ever runs in a browser.

import { icons, esc, APP_STORE, ANDROID_LIVE, SITE } from './layout.mjs';

export const head = ({ eyebrow, title, lede, tag = 'h2', center = true }) => `
<div class="head${center ? ' center' : ''}">
${eyebrow ? `<span class="eyebrow reveal">${eyebrow}</span>` : ''}
<${tag} class="reveal d1">${title}</${tag}>
${lede ? `<p class="lede reveal d2">${lede}</p>` : ''}
</div>`;

export const crumbs = (items) => `
<nav class="wrap crumbs" aria-label="Breadcrumb">
<ol>${items
  .map(([name, href], i) =>
    i === items.length - 1
      ? `<li aria-current="page">${esc(name)}</li>`
      : `<li><a href="${href}">${esc(name)}</a></li>`,
  )
  .join('')}</ol>
</nav>`;

// ---------------------------------------------------------------------------
// The duel card — the product in one glance. Two clubs, the gold bolt, and the
// footballer who links them. Never rendered with an invented answer.
// ---------------------------------------------------------------------------
export const duel = ({ a, b, answer, note, hint }) => `
<div class="panel pad duel reveal">
<div class="duel-row">
<div class="duel-side">
<div class="club">${esc(a)}</div>
${note ? `<div class="meta">${esc(note[0])}</div>` : ''}
</div>
<div class="duel-bolt" aria-hidden="true">${icons.bolt}</div>
<div class="duel-side is-red">
<div class="club">${esc(b)}</div>
${note ? `<div class="meta">${esc(note[1])}</div>` : ''}
</div>
</div>
${
  answer
    ? `<div class="duel-answer">
<span class="tick">${icons.check}</span>
<span class="who">${esc(answer)}</span>
</div>`
    : ''
}
${hint ? `<p class="small dim center" style="margin-top:12px">${hint}</p>` : ''}
</div>`;

// ---------------------------------------------------------------------------
// Store buttons. The Play Store button only ever renders when the app is
// actually on Play — otherwise the visitor gets an honest "coming soon".
// ---------------------------------------------------------------------------
export const storeButtons = (lang, { ev = 'store_click', big = true } = {}) => {
  const size = big ? ' btn-lg' : '';
  const ios =
    lang === 'tr'
      ? ['App Store’dan', 'Ücretsiz İndir']
      : ['Download on the', 'App Store'];
  const android =
    lang === 'tr' ? ['Google Play', 'Çok yakında'] : ['Google Play', 'Coming soon'];
  return `<div class="btn-row">
<a class="btn btn-primary btn-store${size}" href="${APP_STORE}" rel="noopener" data-ev="${ev}">
${icons.apple}<span><span class="s1">${ios[0]}</span><span class="s2">${ios[1]}</span></span>
</a>
${
  ANDROID_LIVE
    ? ''
    : `<span class="btn btn-ghost btn-store${size} is-soon" aria-disabled="true">
${icons.android}<span><span class="s1">${android[0]}</span><span class="s2">${android[1]}</span></span>
</span>`
}
</div>`;
};

// ---------------------------------------------------------------------------
export const stats = (items) => `
<div class="panel stats reveal">
${items.map(([n, l]) => `<div class="s"><div class="n">${esc(n)}</div><div class="l">${esc(l)}</div></div>`).join('')}
</div>`;

export const cards = (items, cls = 'g-3') => `
<div class="grid ${cls}">
${items
  .map((c, i) => {
    const inner = `<div class="ic${c.tone ? ` is-${c.tone}` : ''}">${icons[c.icon] ?? icons.spark}</div>
<h3>${c.title}</h3>
<p>${c.body}</p>
${c.lock ? `<span class="tag-lock">${c.lock}</span>` : ''}`;
    const cn = `panel pad card reveal${i % 3 ? ` d${i % 3}` : ''}`;
    return c.href
      ? `<a class="${cn}" href="${c.href}">${inner}</a>`
      : `<div class="${cn}">${inner}</div>`;
  })
  .join('')}
</div>`;

export const steps = (items) => `
<div class="steps">
${items
  .map(
    (s, i) => `<div class="panel pad step reveal${i ? ` d${i}` : ''}">
<div class="n">${String(i + 1).padStart(2, '0')}</div>
<h3>${s.title}</h3>
<p>${s.body}</p>
</div>`,
  )
  .join('')}
</div>`;

export const faq = (items) => `
<div class="faq">
${items
  .map(
    ([q, a]) => `<details>
<summary>${esc(q)}</summary>
<div class="a">${a}</div>
</details>`,
  )
  .join('')}
</div>`;

export const band = (lang, { title, lede }) => `
<section class="section-tight">
<div class="wrap">
<div class="panel panel-accent pad-lg band reveal">
<h2>${title}</h2>
<p class="lede">${lede}</p>
${storeButtons(lang, { ev: 'band_store_click' })}
</div>
</div>
</section>`;

// ---------------------------------------------------------------------------
// Player table for a club pair. Years come straight from the career archive;
// an unknown year prints as "?" rather than a guess.
// ---------------------------------------------------------------------------
// A club spell prints as first→last recorded season. The archive stores one
// window per club, so a player with two separate stints shows the whole window
// rather than a run of seasons he did not play — the table legend says so
// instead of the page implying continuity it cannot prove.
export const span = (list) => {
  if (!list || !list.length) return '<span class="dim">—</span>';
  return list
    .map((s) => {
      if (s.from == null && s.to == null) return '—';
      if (s.from == null) return `→ ${s.to}`;
      if (s.to == null || s.to === s.from) return `${s.from}`;
      return `${s.from}<b>–</b>${s.to}`;
    })
    .join(' · ');
};

export const playerTable = (players, aName, bName, lang = 'tr') => `
<div class="panel tbl-wrap reveal">
<table class="tbl">
<thead><tr>
<th scope="col">${lang === 'tr' ? 'Futbolcu' : 'Player'}</th>
<th scope="col">${esc(aName)}</th>
<th scope="col">${esc(bName)}</th>
</tr></thead>
<tbody>
${players
  .map(
    (p, i) => `<tr>
<td><div style="display:flex;align-items:center;gap:11px">
<span class="rank">${i + 1}</span>
<span><span class="who">${esc(p.name)}</span>${p.nat ? `<span class="nat">${esc(p.nat)}</span>` : ''}</span>
</div></td>
<td class="yr">${span(p.a)}</td>
<td class="yr">${span(p.b)}</td>
</tr>`,
  )
  .join('')}
</tbody>
</table>
</div>
<p class="small dim" style="margin-top:12px">${
    lang === 'tr'
      ? 'Yıllar, futbolcunun o kulüpteki ilk ve son kayıtlı sezonunu gösterir. İki ayrı dönem geçiren oyuncularda aralık, iki dönemin tamamını kapsar.'
      : 'Years show the first and last recorded season at that club. For players with two separate stints the range spans both.'
  }</p>`;

export const pairList = (pairs, clubs) => {
  const name = (slug) => clubs.find((c) => c.slug === slug)?.short ?? slug;
  return `<div class="pair-list">
${pairs
  .map(
    (p) => `<a class="pair-link" href="/ortak-futbolcu/${p.slug}/">
<span class="vs">${esc(name(p.a))}<i>×</i>${esc(name(p.b))}</span>
<span class="n">${p.count}</span>
</a>`,
  )
  .join('')}
</div>`;
};

// Intrinsic size of the cropped captures (see make-assets.py). Declared on
// every <img> so the browser reserves the box before the file arrives — the
// difference between a stable page and a layout shift.
export const device = (src, alt, { w = 1290, h = 2520, eager = false } = {}) => `
<div class="device reveal">
<img src="${src}" width="${w}" height="${h}" alt="${esc(alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"'} />
</div>`;
