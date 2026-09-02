// /ortak-futbolcu/ — the archive hub and one page per club pairing.
//
// A pairing only gets a page when the archive holds enough verified careers to
// make the page worth landing on. Every name, every year on these pages comes
// out of web/data/football.json; nothing is written by hand and nothing is
// filled in from memory.

import { page, icons, SITE, ldBreadcrumb, ldApp } from '../lib/layout.mjs';
import {
  head,
  crumbs,
  playerTable,
  pairList,
  storeButtons,
  band,
  span,
} from '../lib/ui.mjs';

const fmt = (n) => n.toLocaleString('tr-TR');

// "Beşiktaş’ta", not "Beşiktaş’de". The suffix rides on the club record because
// Turkish harmony follows how a foreign name is pronounced, not how it is spelt.
const inClub = (club) => `${club.name}’${club.loc}`;
const lastYear = (list) => Math.max(0, ...list.map((s) => s.to ?? s.from ?? 0));
const firstYear = (list) =>
  Math.min(...list.map((s) => s.from ?? s.to ?? 9999).filter((y) => y < 9999));

// ---------------------------------------------------------------------------
// A short, factual paragraph about this specific pairing. Everything it states
// is derived from the rows on the page — if the data cannot support a sentence,
// the sentence is not written.
// ---------------------------------------------------------------------------
function context(pair, A, B) {
  const ps = pair.players;
  const out = [];

  // The most recent crossing.
  const recent = [...ps].sort((x, y) => y.recent - x.recent)[0];
  if (recent?.recent) {
    out.push(
      `Listedeki en güncel isim <strong>${recent.name}</strong>; arşivdeki son kaydı ${recent.recent} yılına ait.`,
    );
  }

  // The oldest crossing on record.
  const oldest = [...ps]
    .map((p) => ({ p, y: Math.min(firstYear(p.a), firstYear(p.b)) }))
    .filter((x) => Number.isFinite(x.y))
    .sort((x, y) => x.y - y.y)[0];
  if (oldest && oldest.y < (recent?.recent ?? 0) - 10) {
    out.push(
      `En eskiye giden bağ ise <strong>${oldest.p.name}</strong> üzerinden ${oldest.y}’e uzanıyor.`,
    );
  }

  // Players who appear to have moved straight from one club to the other:
  // the last recorded season at one club is the first at the other.
  const direct = ps.filter((p) => {
    const a1 = lastYear(p.a);
    const b0 = firstYear(p.b);
    const b1 = lastYear(p.b);
    const a0 = firstYear(p.a);
    return (a1 && b0 && a1 === b0) || (b1 && a0 && b1 === a0);
  });
  if (direct.length >= 2) {
    out.push(
      `${direct.length} futbolcunun kaydında iki kulüp arasında doğrudan geçiş görünüyor: ${direct
        .slice(0, 3)
        .map((p) => p.name)
        .join(', ')}${direct.length > 3 ? ' ve diğerleri' : ''}.`,
    );
  }

  // Nationalities that recur across the pairing.
  const nats = {};
  for (const p of ps) if (p.nat) nats[p.nat] = (nats[p.nat] ?? 0) + 1;
  const topNat = Object.entries(nats).sort((a, b) => b[1] - a[1])[0];
  if (topNat && topNat[1] >= 3) {
    out.push(
      `Uyruk dağılımında öne çıkan ülke ${topNat[0]}: iki kulüpte de forma giyen ${topNat[1]} futbolcu bu ülkeden.`,
    );
  }

  return out.join(' ');
}

// ---------------------------------------------------------------------------
export function pairPage(pair, clubs, allPairs) {
  const A = clubs.find((c) => c.slug === pair.a);
  const B = clubs.find((c) => c.slug === pair.b);
  const path = `/ortak-futbolcu/${pair.slug}/`;
  const title = `${A.name} ve ${inClub(B)} Oynamış Futbolcular (${pair.count} İsim)`;
  const description = `${A.name} ve ${B.name} formalarının ikisini de giymiş ${pair.count} futbolcu, sezonlarıyla. Ortak futbolcu oyununda bu eşleşmenin doğru cevapları.`;

  // Other pairings that share a club with this one — the internal links a
  // visitor actually wants next.
  const related = allPairs
    .filter(
      (p) =>
        p.slug !== pair.slug &&
        (p.a === pair.a || p.b === pair.a || p.a === pair.b || p.b === pair.b),
    )
    .sort((x, y) => y.weight - x.weight || y.count - x.count)
    .slice(0, 9);

  const body = `
${crumbs([
  ['Ana Sayfa', '/'],
  ['Ortak futbolcular', '/ortak-futbolcu/'],
  [`${A.short} × ${B.short}`, path],
])}
<section class="wrap section-tight">
<div class="head">
<span class="eyebrow reveal">Ortak futbolcu arşivi</span>
<h1 class="reveal d1">${A.name} ve ${inClub(B)} oynamış futbolcular</h1>
<p class="lede reveal d2">Arşivde her iki kulübün de formasını giymiş <strong>${pair.count} futbolcu</strong> var. Aşağıdaki tablo hepsini, kulüplerdeki ilk ve son kayıtlı sezonlarıyla listeliyor.</p>
</div>
</section>

<section class="section-tight">
<div class="wrap">
${playerTable(pair.players, A.name, B.name, 'tr')}
</div>
</section>

<section class="section-tight">
<div class="wrap wrap-narrow">
<div class="panel pad-lg prose reveal">
<h2 style="margin-top:0">${A.short} – ${B.short} bağlantısı</h2>
<p>${context(pair, A, B)}</p>
<p>Diğer ikililer için <a href="/ortak-futbolcu/">iki takımda da oynayan futbolcular</a> arşivine bakabilirsin. Bu eşleşme oyunda çıktığında yukarıdaki isimlerden <strong>herhangi biri</strong> turu kazandırır — hepsini bilmek gerekmez, birini rakibinden önce yazmak yeterlidir. ${
    pair.count <= 8
      ? 'Ortak isim sayısı düşük olduğu için bu, zor eşleşmelerden biri.'
      : 'Ortak isim sayısı yüksek olduğundan bu eşleşmede asıl belirleyici olan hız.'
  }</p>
</div>
</div>
</section>

<section class="section-tight">
<div class="wrap">
<div class="panel panel-accent is-mint pad-lg band reveal">
<h2 style="font-size:clamp(1.5rem,3vw,2.1rem)">Bu eşleşmeyi oyunda dene</h2>
<p class="lede">${A.short} × ${B.short} açıldığında cevabı ilk sen ver. CrossOver Football iOS’ta ücretsiz.</p>
${storeButtons('tr', { ev: 'pair_install_click' })}
</div>
</div>
</section>

${
  related.length
    ? `<section class="section-tight">
<div class="wrap">
${head({ eyebrow: 'Devamı', title: 'İlgili kulüp eşleşmeleri', lede: `${A.short} ve ${B.short} için diğer ikililer.` })}
${pairList(related, clubs)}
<div class="center" style="margin-top:24px"><a class="btn btn-ghost" href="/ortak-futbolcu/">Arşivin tamamı ${icons.arrow}</a></div>
</div>
</section>`
    : ''
}`;

  return page({
    lang: 'tr',
    path,
    title,
    description,
    body,
    jsonld: [
      ldBreadcrumb([
        ['Ana Sayfa', '/'],
        ['Ortak futbolcular', '/ortak-futbolcu/'],
        [`${A.short} × ${B.short}`, path],
      ]),
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `${A.name} ve ${inClub(B)} oynamış futbolcular`,
        numberOfItems: pair.count,
        itemListOrder: 'https://schema.org/ItemListUnordered',
        itemListElement: pair.players.slice(0, 30).map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          item: {
            '@type': 'Person',
            name: p.name,
            ...(p.nat ? { nationality: p.nat } : {}),
          },
        })),
      },
      ldApp('tr'),
    ],
  });
}

// ---------------------------------------------------------------------------
export function pairHub(pairs, clubs, totals) {
  const path = '/ortak-futbolcu/';

  // Grouped by club so the index is browsable rather than one long dump.
  const order = clubs.filter((c) => pairs.some((p) => p.a === c.slug || p.b === c.slug));
  const groups = order.map((club) => ({
    club,
    items: pairs
      .filter((p) => p.a === club.slug || p.b === club.slug)
      .sort((x, y) => y.count - x.count),
  }));

  const totalPlayers = new Set();
  for (const p of pairs) for (const pl of p.players) totalPlayers.add(pl.id);

  const body = `
${crumbs([
  ['Ana Sayfa', '/'],
  ['Ortak futbolcular', path],
])}
<section class="wrap section-tight">
${head({
  eyebrow: 'Arşiv',
  title: 'İki takımda da oynamış futbolcular',
  lede: `Kulüp ikilisini seç, ikisinde de forma giymiş herkesi yıllarıyla gör. Şu an ${pairs.length} eşleşme ve ${fmt(totalPlayers.size)} futbolcu listeleniyor.`,
  tag: 'h1',
})}
</section>

<section class="section-tight">
<div class="wrap wrap-narrow">
<div class="panel panel-accent pad-lg reveal" style="margin-bottom:18px;text-align:center">
<h2 style="font-size:1.3rem;margin-bottom:8px">Aradığın ikili listede yok mu?</h2>
<p class="muted" style="margin-bottom:18px">Bulucuyla herhangi iki kulübü seç, ortak futbolcuları anında gör.</p>
<a class="btn btn-gold" href="/ortak-futbolcu-bulucu/">${icons.search} Ortak futbolcu bulucuyu aç</a>
</div>
<div class="panel pad-lg prose reveal">
<p style="margin-top:0">Bu arşiv, CrossOver Football’ın cevapları doğrularken kullandığı kariyer verisinin okunabilir hâli. “<a href="/ortak-futbolcu-oyunu/">Ortak futbolcu</a>” oyununda bir eşleşmeye takıldıysan, doğru cevapların tamamı burada.</p>
<p><strong>Nasıl okunur:</strong> yıllar, futbolcunun o kulüpteki ilk ve son kayıtlı sezonunu gösterir. Kiralık ve altyapı dönemleri ana kulübe sayılır — oyundaki doğrulama da aynı kuralı uygular.</p>
</div>
</div>
</section>

${groups
  .map(
    ({ club, items }, i) => `<section class="section-tight" id="${club.slug}">
<div class="wrap">
<h2 style="font-size:1.4rem;margin-bottom:6px" class="reveal">${club.name}</h2>
<p class="small dim reveal" style="margin-bottom:18px">${items.length} eşleşme · ${club.country}</p>
${pairList(items, clubs)}
</div>
</section>`,
  )
  .join('')}

${band('tr', {
  title: 'Arşivi ezberleme, oyna',
  lede: 'Bu isimleri hatırlamanın en hızlı yolu, onları bir turda kaçırmak.',
})}`;

  return page({
    lang: 'tr',
    path,
    title: 'İki Takımda da Oynayan Futbolcular — Ortak Futbolcu Arşivi',
    description: `İki takımda da oynayan futbolcular (ortak oyuncular): ${pairs.length} kulüp eşleşmesinin tam listesi. Galatasaray, Fenerbahçe ve Avrupa devlerinden isimler, sezonlarıyla.`,
    body,
    jsonld: [
      ldBreadcrumb([
        ['Ana Sayfa', '/'],
        ['Ortak futbolcular', path],
      ]),
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'İki takımda da oynamış futbolcular',
        url: SITE + path,
        isPartOf: { '@id': `${SITE}/#website` },
        hasPart: pairs.slice(0, 60).map((p) => ({
          '@type': 'WebPage',
          url: `${SITE}/ortak-futbolcu/${p.slug}/`,
          name: `${clubs.find((c) => c.slug === p.a).name} ve ${inClub(clubs.find((c) => c.slug === p.b))} oynamış futbolcular`,
        })),
      },
    ],
  });
}
