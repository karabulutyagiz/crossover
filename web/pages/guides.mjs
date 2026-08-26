// /rehber/ — the content hub. Four articles at launch, each carrying something
// the rest of the Turkish web does not have: either a dataset nobody else
// published, or a method written from actually playing the game.
//
// Deliberately not "10 articles of 1000 words each". A guide ships when it has
// a reason to exist.

import { page, icons, SITE, ldBreadcrumb, ldFaq } from '../lib/layout.mjs';
import { head, crumbs, storeButtons, band, faq, pairList, span } from '../lib/ui.mjs';

const fmt = (n) => n.toLocaleString('tr-TR');

export const GUIDES = [
  {
    slug: 'derbi-transferleri',
    title: 'Hem Galatasaray hem Fenerbahçe’de oynayanlar (ve tüm derbi geçişleri)',
    short: 'Derbi transferleri',
    lede: 'Türkiye’nin dört büyüğünden en az ikisinin formasını giymiş her futbolcu, sezonlarıyla tek listede.',
    eyebrow: 'Veri',
    date: '2026-08-26',
  },
  {
    slug: 'iki-takimda-da-oynayan-futbolcu-nasil-bulunur',
    title: 'İki takımda da oynayan futbolcu nasıl bulunur?',
    short: 'Cevabı bulma yöntemi',
    lede: 'Rastgele isim saymayı bırak. Transfer trafiğini okuyan altı refleks, ortak futbolcuyu saniyeler içinde çıkarır.',
    eyebrow: 'Yöntem',
    date: '2026-08-26',
  },
  {
    slug: 'zor-ortak-futbolcu-eslesmeleri',
    title: 'En zor ortak futbolcu eşleşmeleri',
    short: 'Zor eşleşmeler',
    lede: 'Bazı kulüp ikilileri arasında sadece birkaç isim var. Arşivin en dar kesişimleri ve tek çıkış yolları.',
    eyebrow: 'Veri',
    date: '2026-08-26',
  },
  {
    slug: 'futbol-bilgini-gelistirme',
    title: 'Futbol bilgisi nasıl geliştirilir?',
    short: 'Bilgini geliştir',
    lede: 'Maç izlemek bilgi biriktirir ama hatırlamayı öğretmez. Haftada iki saatle işleyen bir çalışma düzeni.',
    eyebrow: 'Rehber',
    date: '2026-08-26',
  },
];

const article = ({ slug, title, description, eyebrow, h1, lede, content, jsonldExtra = [], date }) => {
  const path = `/rehber/${slug}/`;
  const others = GUIDES.filter((g) => g.slug !== slug).slice(0, 3);

  const body = `
${crumbs([
  ['Ana Sayfa', '/'],
  ['Rehber', '/rehber/'],
  [GUIDES.find((g) => g.slug === slug).short, path],
])}
<section class="wrap section-tight">
<div class="head">
<span class="eyebrow reveal">${eyebrow}</span>
<h1 class="reveal d1">${h1}</h1>
<p class="lede reveal d2">${lede}</p>
</div>
</section>

<section class="section-tight">
<div class="wrap wrap-narrow">
${content}
</div>
</section>

<section class="section-tight">
<div class="wrap">
<div class="panel panel-accent is-mint pad-lg band reveal">
<h2 style="font-size:clamp(1.5rem,3vw,2.1rem)">Okumak yetmez, oyna</h2>
<p class="lede">Bu bilgiyi süre baskısı altında kullanabiliyor musun? On iki saniyen var.</p>
${storeButtons('tr', { ev: 'guide_install_click' })}
</div>
</div>
</section>

<section class="section-tight">
<div class="wrap">
${head({ eyebrow: 'Rehber', title: 'Diğer yazılar' })}
<div class="grid g-3">
${others
  .map(
    (g, i) => `<a class="panel pad card reveal${i ? ` d${i}` : ''}" href="/rehber/${g.slug}/">
<div class="ic is-gold">${icons.book}</div>
<h3>${g.short}</h3>
<p>${g.lede}</p>
</a>`,
  )
  .join('')}
</div>
</div>
</section>`;

  return page({
    lang: 'tr',
    path,
    title,
    description,
    body,
    ogType: 'article',
    jsonld: [
      ldBreadcrumb([
        ['Ana Sayfa', '/'],
        ['Rehber', '/rehber/'],
        [GUIDES.find((g) => g.slug === slug).short, path],
      ]),
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: h1,
        description,
        inLanguage: 'tr-TR',
        datePublished: date,
        dateModified: date,
        mainEntityOfPage: { '@type': 'WebPage', '@id': SITE + path },
        image: `${SITE}/img/og-default.png`,
        author: { '@id': `${SITE}/#organization` },
        publisher: { '@id': `${SITE}/#organization` },
      },
      ...jsonldExtra,
    ],
  });
};

// ---------------------------------------------------------------------------
export function guideHub() {
  const body = `
${crumbs([
  ['Ana Sayfa', '/'],
  ['Rehber', '/rehber/'],
])}
<section class="wrap section-tight">
${head({
  eyebrow: 'Rehber',
  title: 'Futbol hafızası üzerine',
  lede: 'Transfer geçmişi, derbi geçişleri ve ortak futbolcu bulma yöntemleri. Hepsi kariyer arşivine dayanıyor.',
  tag: 'h1',
})}
</section>
<section class="section-tight">
<div class="wrap">
<div class="grid g-2">
${GUIDES.map(
  (g, i) => `<a class="panel pad-lg card reveal${i % 2 ? ' d1' : ''}" href="/rehber/${g.slug}/">
<span class="eyebrow">${g.eyebrow}</span>
<h3 style="margin:12px 0 10px;font-size:1.25rem">${g.title}</h3>
<p>${g.lede}</p>
<span class="tag-lock" style="color:var(--emerald-hi)">Oku →</span>
</a>`,
).join('')}
</div>
</div>
</section>
${band('tr', { title: 'Bilgini sahada dene', lede: 'Rehber okumak ısınma; asıl maç uygulamada.' })}`;

  return page({
    lang: 'tr',
    path: '/rehber/',
    title: 'Futbol Rehberi — Transfer Hafızası ve Ortak Futbolcu Taktikleri',
    description:
      'Derbi transferleri, iki takımda da oynayan futbolcuyu bulma yöntemleri, en zor kulüp eşleşmeleri ve futbol bilgisini geliştirme rehberi.',
    body,
    jsonld: [
      ldBreadcrumb([
        ['Ana Sayfa', '/'],
        ['Rehber', '/rehber/'],
      ]),
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Futbol rehberi',
        url: `${SITE}/rehber/`,
        isPartOf: { '@id': `${SITE}/#website` },
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// 1. Derby crossings — a dataset nobody else has published in one table.
// ---------------------------------------------------------------------------
export function guideDerby({ derby }) {
  const four = derby.filter((d) => d.count === 4);
  const three = derby.filter((d) => d.count === 3);
  const two = derby.filter((d) => d.count === 2);

  const row = (d) => `<tr>
<td><span class="who">${d.name}</span>${d.nat ? `<span class="nat">${d.nat}</span>` : ''}</td>
<td class="yr">${d.clubs.map((c) => `${c.name} ${span(c.spells)}`).join('<br />')}</td>
</tr>`;

  const table = (list) => `<div class="panel tbl-wrap reveal" style="margin-block:18px">
<table class="tbl">
<thead><tr><th scope="col">Futbolcu</th><th scope="col">Kulüpler ve sezonlar</th></tr></thead>
<tbody>${list.map(row).join('')}</tbody>
</table>
</div>`;

  const content = `
<div class="panel pad-lg prose reveal">
<p style="margin-top:0">Türkiye’de bir futbolcunun derbi rakibine transfer olması hâlâ olay olur. Yine de arşivde <strong>${derby.length} futbolcu</strong> dört büyüklerden en az ikisinin formasını giymiş durumda. Aşağıdaki listeler bunların tamamını, kulüplerdeki ilk ve son kayıtlı sezonlarıyla veriyor.</p>
<p class="small dim">Yıllar, futbolcunun o kulüpteki ilk ve son kayıtlı sezonunu gösterir; iki ayrı dönem geçirenlerde aralık ikisini birden kapsar. Kiralık ve altyapı dönemleri ana kulübe sayılır.</p>
</div>

<div class="panel pad-lg prose reveal" style="margin-top:22px">
<h2 style="margin-top:0">Dört büyüğün dördünde de oynayanlar</h2>
<p>Türk futbolunun en nadir kulübü: ${four.length} isim.</p>
</div>
${table(four)}

<div class="panel pad-lg prose reveal">
<h2 style="margin-top:0">Üç büyükte forma giyenler</h2>
<p>${three.length} futbolcu, dört büyüklerden üçünün formasını giymiş.</p>
</div>
${table(three)}

<div class="panel pad-lg prose reveal">
<h2 style="margin-top:0">İki büyükte forma giyenler</h2>
<p>Listenin en kalabalık bölümü: ${two.length} futbolcu. Ortak futbolcu oyununda Türkiye içi eşleşmelerin doğru cevapları büyük ölçüde burada.</p>
</div>
${table(two)}

<div class="panel pad-lg prose reveal">
<h2 style="margin-top:0">Kulüp ikilisine göre bakmak istersen</h2>
<p>Bu listeyi eşleşme bazında görmek için arşivdeki ilgili sayfalara geçebilirsin:
<a href="/ortak-futbolcu/galatasaray-fenerbahce/">Galatasaray – Fenerbahçe</a>,
<a href="/ortak-futbolcu/fenerbahce-besiktas/">Fenerbahçe – Beşiktaş</a>,
<a href="/ortak-futbolcu/galatasaray-besiktas/">Galatasaray – Beşiktaş</a>,
<a href="/ortak-futbolcu/besiktas-trabzonspor/">Beşiktaş – Trabzonspor</a>,
<a href="/ortak-futbolcu/galatasaray-trabzonspor/">Galatasaray – Trabzonspor</a>,
<a href="/ortak-futbolcu/fenerbahce-trabzonspor/">Fenerbahçe – Trabzonspor</a>.</p>
</div>`;

  return article({
    slug: 'derbi-transferleri',
    eyebrow: 'Veri · Türkiye',
    h1: 'Hem Galatasaray hem Fenerbahçe’de oynayanlar — ve tüm derbi geçişleri',
    lede: `Dört büyüklerden en az ikisinin formasını giymiş ${derby.length} futbolcu, sezonlarıyla tek listede.`,
    title: 'Derbi Transferleri: Dört Büyükte Oynamış Futbolcular Listesi',
    description:
      'Hem Galatasaray hem Fenerbahçe’de oynayanlar, üç büyükte forma giyenler ve dört büyüğün dördünü de gören isimler. Sezonlarıyla tam liste.',
    content,
    date: '2026-08-26',
  });
}

// ---------------------------------------------------------------------------
// 2. Method guide — written from the mechanics of the game, not padded.
// ---------------------------------------------------------------------------
export function guideHowToFind({ pairs, clubs }) {
  const FAQ = [
    [
      'Ortak futbolcuyu bulmanın en hızlı yolu nedir?',
      '<p>İki kulübün ortak transfer dönemini bulmak. Kulüpler aynı seviyedeyse doğrudan geçiş, farklı seviyedeyse üçüncü bir kulüp üzerinden dolaylı bağ aramak gerekir.</p>',
    ],
    [
      'Hiç aklıma gelmezse ne yapmalıyım?',
      '<p>Kulüplerin kariyer sonu kadrolarını düşün. Avrupa’da yıldızlaşan isimlerin son durakları, ilk bakışta uzak görünen eşleşmelerin en sık cevabıdır.</p>',
    ],
  ];

  const content = `
<div class="panel pad-lg prose reveal">
<p style="margin-top:0">Ortak futbolcu oyununda kaybedenlerin çoğu bilgisizlikten değil, <strong>yanlış arama stratejisinden</strong> kaybeder. Rastgele futbolcu saymak yerine transfer trafiğini okumak gerekir. İşe yarayan altı refleks:</p>

<h2>1. Önce doğrudan transferi ara</h2>
<p>İki kulüp benzer seviyedeyse aralarında doğrudan geçiş yapmış biri neredeyse kesin vardır. Aynı ligin iki büyüğü, aynı ülkenin iki Avrupa temsilcisi ya da düzenli oyuncu takas eden iki kulüp — buradan başla.</p>

<h2>2. Süper Lig’i “son durak” olarak düşün</h2>
<p>Bir Avrupa devi ile bir Türk kulübü eşleştiğinde ilk taraman gereken grup, kariyerinin son iki-üç sezonunu Türkiye’de geçirmiş isimlerdir. Türk kulüpleri onlarca yıldır Avrupa’nın deneyimli oyuncuları için doğal bir varış noktası.</p>

<h2>3. Kiralıkları unutma</h2>
<p>Yarım sezonluk kiralıklar en çok kaçırılan cevaplardır çünkü kimsenin aklında “o kulübün oyuncusu” olarak yer etmezler. Oysa doğrulama onları da sayar. Bir isimden şüpheleniyorsan kiralık ihtimalini eleme.</p>

<h2>4. Altyapıyı hesaba kat</h2>
<p>Bir futbolcunun profesyonel kariyeri başka yerde geçmiş olabilir ama altyapısı o kulüpteyse ve A takımda bir maç bile oynadıysa cevap geçerlidir. Özellikle Hollanda, Portekiz ve İspanya kulüpleri için bu kapı sık açılır.</p>

<h2>5. Kaleci ve savunmacıları atlama</h2>
<p>Herkesin aklına önce forvetler gelir çünkü gol atanlar hatırlanır. Oysa kaleciler uzun kariyerler yapar ve çok kulüp değiştirir. Forvetlerde tıkandıysan kaleye bak.</p>

<h2>6. Kesişimin dar olduğunu kabul et</h2>
<p>Bazı eşleşmelerde gerçekten sadece birkaç isim vardır. Arşivde ${pairs.length} eşleşmenin ${pairs.filter((p) => p.count <= 6).length} tanesinde ortak futbolcu sayısı altı ya da altında. Böyle turlarda listeyi taramak yerine tek bir “köprü” isim hatırlamaya çalışmak daha hızlı sonuç verir — <a href="/rehber/zor-ortak-futbolcu-eslesmeleri/">en dar kesişimler burada</a>.</p>

<h2>Çalışmanın en verimli yolu</h2>
<p>Bu refleksler okuyarak değil, kaçırarak yerleşir. Bir turu kaybettiğinde doğru cevabın kariyeri açılır; o an öğrendiğin transfer, bir daha unutulmaz. <a href="/ortak-futbolcu/">Arşivi</a> ezberlemeye çalışmak yerine oynayıp kaçırdıklarına bak.</p>
</div>`;

  return article({
    slug: 'iki-takimda-da-oynayan-futbolcu-nasil-bulunur',
    eyebrow: 'Yöntem',
    h1: 'İki takımda da oynayan futbolcu nasıl bulunur?',
    lede: 'Rastgele isim saymayı bırak. Transfer trafiğini okuyan altı refleks, doğru ismi saniyeler içinde çıkarır.',
    title: 'İki Takımda da Oynayan Futbolcu Nasıl Bulunur? 6 Yöntem',
    description:
      'Ortak futbolcu oyununda doğru ismi hızlı bulmanın yolları: doğrudan transferler, kariyer sonu durakları, kiralıklar, altyapı kayıtları ve dar kesişimler.',
    content,
    jsonldExtra: [ldFaq(FAQ)],
    date: '2026-08-26',
  });
}

// ---------------------------------------------------------------------------
// 3. Hardest pairings — straight out of the archive.
// ---------------------------------------------------------------------------
export function guideHardPairs({ pairs, clubs }) {
  const name = (s) => clubs.find((c) => c.slug === s)?.name ?? s;
  const hard = [...pairs].sort((a, b) => a.count - b.count || b.weight - a.weight).slice(0, 20);

  const content = `
<div class="panel pad-lg prose reveal">
<p style="margin-top:0">Ortak futbolcu oyununda bazı eşleşmeler kolaydır: iki büyük kulüp arasında onlarca isim gidip gelmiştir, sorun cevabı bulmak değil, rakipten önce yazmaktır. Bazılarındaysa arşivde <strong>topu topu birkaç isim</strong> vardır — ve o isimleri bilmiyorsan tur kaybedilmiştir.</p>
<p>Aşağıda arşivin en dar kesişimleri var. Her satırdaki sayı, o ikilinin kaç ortak futbolcusu olduğunu gösteriyor.</p>
</div>

<div class="panel tbl-wrap reveal" style="margin-block:22px">
<table class="tbl">
<thead><tr><th scope="col">Eşleşme</th><th scope="col">Ortak futbolcu</th><th scope="col">Cevaplardan biri</th></tr></thead>
<tbody>
${hard
  .map(
    (p) => `<tr>
<td><a href="/ortak-futbolcu/${p.slug}/" class="who" style="color:var(--emerald-hi)">${name(p.a)} × ${name(p.b)}</a></td>
<td class="yr"><b>${p.count}</b></td>
<td class="yr">${p.players[0].name}</td>
</tr>`,
  )
  .join('')}
</tbody>
</table>
</div>

<div class="panel pad-lg prose reveal">
<h2 style="margin-top:0">Dar kesişimler neden zor?</h2>
<p>İki kulüp arasında oyuncu trafiği yoksa bunun genelde yapısal bir sebebi vardır: farklı liglerde, farklı bütçe seviyelerinde ya da farklı transfer ağlarında hareket ederler. Böyle bir eşleşmede “kim geçmiş olabilir” diye düşünmek işe yaramaz; tek yol o birkaç istisnayı hatırlamaktır.</p>
<p>Bu yüzden zor eşleşmeler ezber ödülü verir. Yukarıdaki tablodaki isimleri bilen biri, oyunun en kritik turlarında rakibine iki saniye fark atar.</p>
<h2>Tam listeler</h2>
<p>Her satırdaki eşleşmenin sayfasında ortak futbolcuların tamamı, sezonlarıyla listeleniyor. <a href="/ortak-futbolcu/">Arşivin tamamına</a> göz atabilirsin.</p>
</div>`;

  return article({
    slug: 'zor-ortak-futbolcu-eslesmeleri',
    eyebrow: 'Veri · Arşiv',
    h1: 'En zor ortak futbolcu eşleşmeleri',
    lede: 'Bazı kulüp ikilileri arasında sadece birkaç isim var. Arşivin en dar 20 kesişimi ve çıkış yolları.',
    title: 'En Zor Ortak Futbolcu Eşleşmeleri — Arşivin En Dar Kesişimleri',
    description:
      'Hangi kulüp ikililerinde neredeyse hiç ortak futbolcu yok? Arşivdeki en dar 20 kesişim, ortak oyuncu sayıları ve bilinmesi gereken isimler.',
    content,
    date: '2026-08-26',
  });
}

// ---------------------------------------------------------------------------
// 4. Practical routine.
// ---------------------------------------------------------------------------
export function guideImprove({ totals }) {
  const content = `
<div class="panel pad-lg prose reveal">
<p style="margin-top:0">Futbol bilgisi maç izleyerek büyümez — maç izlemek <em>güncel</em> tutar. Bir eşleşme sorulduğunda saniyeler içinde doğru ismi çıkarabilmek başka bir kas, ve o kas başka türlü çalıştırılır.</p>

<h2>Neyi çalıştırdığını bil</h2>
<p>İki ayrı yetenekten söz ediyoruz. <strong>Tanıma:</strong> isim gördüğünde kariyerini bilirsin. <strong>Geri çağırma:</strong> elinde sadece iki kulüp varken ismi hafızandan çıkarırsın. Bilgi yarışmalarında kaybettiren neredeyse hep ikincisidir, çünkü kimse ikincisini çalışmaz.</p>

<h2>Haftada iki saatlik düzen</h2>
<ol>
<li><strong>Haftada bir kulüp seç (30 dk).</strong> Son on yılın gelen-giden listesini oku. Kadro değil, <em>transfer akışı</em> — kimden aldı, kime sattı.</li>
<li><strong>Köprüleri işaretle (15 dk).</strong> O kulübün en çok oyuncu alışverişi yaptığı üç kulübü not et. Bu üçlü, ileride onlarca eşleşmenin cevabını verir.</li>
<li><strong>Kendini test et (45 dk).</strong> Okuduğunu değil, hatırladığını ölç. Süre baskısı olmadan yapılan test yanıltır; rakiple oyna.</li>
<li><strong>Kaçırdıklarını topla (30 dk).</strong> Bilemediğin her isim bir boşluğun işareti. Onları biriktir, hafta sonu tekrar bak.</li>
</ol>

<h2>Hafızada en çok yer tutan üç grup</h2>
<ul>
<li><strong>Kariyer sonu transferleri.</strong> Büyük isimlerin son durakları, beklenmedik eşleşmelerin en sık cevabıdır.</li>
<li><strong>Kısa kiralıklar.</strong> Yarım sezonluk dönemler kimsenin aklında kalmaz — tam da bu yüzden turu onlar kazandırır.</li>
<li><strong>Kaleciler.</strong> Uzun kariyer, çok kulüp, düşük görünürlük. Herkesin kör noktası.</li>
</ul>

<h2>Neden oynayarak öğrenmek daha hızlı?</h2>
<p>Bir ismi okuyarak öğrenmekle, onu kaçırdıktan sonra öğrenmek aynı şey değil. Kaybedilen tur bir duygu bırakır ve bilgi o duyguya tutunur. CrossOver Football’da her yanlış cevaptan sonra doğru futbolcunun tüm kulüp geçmişi yıllarıyla açılır; arşiv <strong>${fmt(totals.players)} futbolcu</strong> ve <strong>${fmt(totals.spells)} kariyer dönemi</strong> içerdiği için öğrenecek şey uzun süre bitmez.</p>
<p>Başlangıç noktası arıyorsan: <a href="/rehber/iki-takimda-da-oynayan-futbolcu-nasil-bulunur/">arama refleksleri</a> ve <a href="/rehber/derbi-transferleri/">derbi geçişleri listesi</a>.</p>
</div>`;

  return article({
    slug: 'futbol-bilgini-gelistirme',
    eyebrow: 'Rehber',
    h1: 'Futbol bilgisi nasıl geliştirilir?',
    lede: 'Maç izlemek bilgi biriktirir ama hatırlamayı öğretmez. Haftada iki saatle işleyen bir çalışma düzeni.',
    title: 'Futbol Bilgisi Nasıl Geliştirilir? Haftada 2 Saatlik Düzen',
    description:
      'Futbol bilgini gerçekten büyüten yöntem: transfer akışı okuma, köprü kulüpleri işaretleme, süre baskısı altında test etme ve kaçırdıklarını toplama.',
    content,
    date: '2026-08-26',
  });
}
