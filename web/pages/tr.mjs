// Turkish pages. Copy is written to be read by a football fan first and a
// crawler second: no keyword padding, no "benzersiz deneyime hazır mısınız".

import {
  page,
  icons,
  APP_STORE,
  SITE,
  BRAND,
  ldApp,
  ldWebSite,
  ldOrganization,
  ldBreadcrumb,
  ldFaq,
} from '../lib/layout.mjs';
import {
  head,
  crumbs,
  duel,
  storeButtons,
  stats,
  cards,
  steps,
  faq,
  band,
  device,
  pairList,
} from '../lib/ui.mjs';

const fmt = (n) => n.toLocaleString('tr-TR');

// The three duels used as the instant explainer. Each answer is checked against
// the career archive by build.mjs before it can ship.
export const HERO_DUELS = [
  {
    a: 'Fenerbahçe',
    b: 'Real Madrid',
    answer: 'Roberto Carlos',
    slug: 'fenerbahce-real-madrid',
    note: ['2007–2009', '1996–2007'],
  },
  {
    a: 'Galatasaray',
    b: 'Inter',
    answer: 'Wesley Sneijder',
    slug: 'galatasaray-inter',
    note: ['2013–2017', '2009–2013'],
  },
  {
    a: 'Beşiktaş',
    b: 'Barcelona',
    answer: 'Ricardo Quaresma',
    slug: 'besiktas-barcelona',
    note: ['2010–2012', '2008–2009'],
  },
];

const MODES = [
  {
    icon: 'users',
    title: 'Takım × Takım',
    body: 'Oyunun kalbi. İki kulüp açılır, ikisinde de oynamış futbolcuyu ilk yazan turu kilitler. Ücretsiz ve varsayılan mod.',
    tone: null,
  },
  {
    icon: 'globe',
    title: 'Ülke × Takım',
    body: 'Bir ülke ve bir kulüp eşleşir: o kulüpte forma giymiş, o ülkeden bir futbolcu bulman gerekir.',
    tone: 'blue',
    lock: 'Sosyal Paket',
  },
  {
    icon: 'letter',
    title: 'Harf × Takım',
    body: 'Bir harf ve bir kulüp. Adı o harfle başlayan, o kulüpte oynamış futbolcuyu bul. En zorlayıcı mod.',
    tone: 'purple',
    lock: 'Sosyal Paket',
  },
  {
    icon: 'bot',
    title: 'Bot Maçı',
    body: 'Tek başınayken pratik yap. Kolay, Orta ve Zor botlar; kupa baskısı olmadan bilgini ısıt.',
    tone: 'gold',
  },
  {
    icon: 'trophy',
    title: 'Dereceli Maç',
    body: 'Hemen Oyna ile canlı rakibe eşleş. Kazandıkça kupa topla, Mahalle Sahası’ndan GOAT arenasına tırman.',
    tone: null,
  },
  {
    icon: 'spark',
    title: 'Dostluk Maçı',
    body: 'Arkadaşını ekle, davet gönder ya da oda kodunu paylaş. Kupa yok, sadece hesaplaşma.',
    tone: 'blue',
  },
];

const FEATURES = [
  {
    icon: 'clock',
    title: 'İlk yazan kilitler',
    body: 'Doğrulama sunucuda ve atomik. İki oyuncu aynı anda yazsa bile turu kimin aldığı tartışmaya açık değil.',
  },
  {
    icon: 'search',
    title: 'Yazım hatası affeder',
    body: '“snayder”, “sneider”, “SNEIJDER” — hepsi Wesley Sneijder’e gider. Türkçe karakter ve aksan duyarsız eşleştirme.',
    tone: 'gold',
  },
  {
    icon: 'book',
    title: 'Gerçek kariyer verisi',
    body: 'Cevap doğruysa futbolcunun tüm kulüp geçmişi yıllarıyla açılır. Tahmin değil, kayıt.',
    tone: 'blue',
  },
  {
    icon: 'shield',
    title: 'Kapsamı sen seç',
    body: 'Tüm dünya çok mu geniş? Maçı tek bir lige ya da tek bir ülkeye kilitle, kendi sahanda oyna.',
  },
  {
    icon: 'trophy',
    title: 'Arena basamakları',
    body: 'Yedi arena: Mahalle Sahası, Amatör, Profesyonel, Şampiyonlar, Efsaneler, Dünya Klasmanı ve GOAT.',
    tone: 'gold',
  },
  {
    icon: 'users',
    title: 'Arkadaşlarla',
    body: 'Arkadaş ekle, mesajlaş, dostluk maçı kur. Mesajlaşma yalnızca doğrulanmış hesaplara açık.',
    tone: 'blue',
  },
];

const HOME_FAQ = [
  [
    'Ortak futbolcu oyunu nedir?',
    '<p>İki kulüp söylenir; ikisinde de forma giymiş bir futbolcuyu ilk bulan kazanır. Sahada ve sohbetlerde yıllardır oynanan bu oyunun kurallı, hakemli ve gerçek transfer verisiyle doğrulanan hâli CrossOver Football’dır.</p>',
  ],
  [
    'Oyun ücretsiz mi?',
    '<p>Evet. İndirmek ve Takım × Takım modunda sınırsız oynamak ücretsiz. İsteğe bağlı elmas paketleri ve Ülke × Takım ile Harf × Takım modlarını açan Sosyal Paket aboneliği var.</p>',
  ],
  [
    'Android sürümü var mı?',
    '<p>Şu an yalnızca iOS’ta yayında. Android sürümü hazırlanıyor; çıktığında bu sayfadan duyuracağız.</p>',
  ],
  [
    'Tek başıma oynayabilir miyim?',
    '<p>Evet. Kolay, Orta ve Zor bot maçlarıyla kupa riski almadan pratik yapabilirsin. Ayrıca arkadaşınla oda kodu üzerinden özel maç kurabilirsin.</p>',
  ],
  [
    'Cevabı yanlış sayarsa ne olur?',
    '<p>Doğrulama, futbolcunun her iki kulüpteki kayıtlı dönemlerine bakar; altyapı ve kiralık dönemler de ana kulübe sayılır. Yazım hataları otomatik düzeltilir. Yine de hatalı gördüğün bir sonuç olursa destek adresinden bildir, kaydı kontrol edelim.</p>',
  ],
];

// ---------------------------------------------------------------------------
export function home({ totals, heroPairs, featured, clubs }) {
  const title =
    'CrossOver Football — Ortak Futbolcu Bilme Oyunu | Ücretsiz İndir';
  const description =
    'İki takım seç, ikisinde de oynamış ortak futbolcuyu rakibinden önce bul. Gerçek transfer verisiyle çalışan, canlı 1v1 futbol bilgi oyunu. iOS’ta ücretsiz.';

  const body = `
<section class="wrap hero">
<div class="hero-grid">
<div>
<span class="eyebrow reveal">Ortak futbolcu oyunu</span>
<h1 class="display reveal d1">Futbol bilgine <span class="gold">güveniyor musun?</span></h1>
<p class="lede reveal d2">İki kulüp açılır. İkisinde de forma giymiş futbolcuyu rakibinden önce yazarsan tur senin. Üç turu ilk alan maçı ve kupaları alır.</p>
<div class="reveal d3">
${storeButtons('tr', { ev: 'hero_install_click' })}
<p class="hero-note" style="margin-top:16px;justify-content:flex-start">
<span class="chip chip-live"><span class="dot"></span> Canlı 1v1</span>
<span class="chip">Ücretsiz</span>
<span class="chip">Bot modu</span>
</p>
</div>
</div>
<div class="hero-art">
${device('/img/screens/tr-guess.webp', 'CrossOver Football tahmin ekranı: iki kulüp, geri sayım ve cevap alanı', { eager: true })}
</div>
</div>
</section>

<section class="section-tight">
<div class="wrap">
${head({
  eyebrow: 'Beş saniyede',
  title: 'Oyun tam olarak bu',
  lede: 'Aşağıdaki üç tur gerçek. Cevapların hepsi kariyer arşivinden doğrulandı — kulüp adına dokunursan tüm listeyi görürsün.',
})}
<div class="grid g-3">
${heroPairs
  .map(
    (d, i) => `<a href="/ortak-futbolcu/${d.slug}/" class="reveal${i ? ` d${i}` : ''}" style="display:block">
${duel({ a: d.a, b: d.b, answer: d.answer, note: d.note })}
</a>`,
  )
  .join('')}
</div>
</div>
</section>

<section class="section-tight">
<div class="wrap">
${stats([
  [fmt(totals.players), 'Futbolcu'],
  [fmt(totals.clubs), 'Kulüp'],
  [fmt(totals.spells), 'Kariyer dönemi'],
  ['7', 'Arena'],
])}
<p class="small dim center" style="margin-top:14px">Oyunun kariyer arşivindeki gerçek kayıt sayıları.</p>
</div>
</section>

<section class="section">
<div class="wrap">
${head({
  eyebrow: 'Nasıl oynanır',
  title: 'Bir tur, üç hamle',
  lede: 'Kural öğrenmek için beş dakika harcamıyorsun. İlk turun ilk saniyesinde ne yapman gerektiğini biliyorsun.',
})}
${steps([
  {
    title: 'Takımını seç',
    body: 'Geri sayım biter bitmez arama kutusuna kendi kulübünü yaz. Rakibin de aynı anda kendi takımını seçiyor.',
  },
  {
    title: 'İki takım açılır',
    body: 'Senin seçtiğin kulüp ile rakibinkinin karşısına geçer. Süre işlemeye başlar.',
  },
  {
    title: 'Ortak futbolcuyu yaz',
    body: 'İkisinde de oynamış bir isim yaz. İlk doğru cevap turu kilitler, futbolcunun tüm kariyeri ekranda açılır.',
  },
])}
<div class="center" style="margin-top:32px">
<a class="btn btn-ghost" href="/nasil-oynanir/">Turun tamamını ekranlarla gör ${icons.arrow}</a>
</div>
</div>
</section>

<section class="section">
<div class="wrap">
${head({
  eyebrow: 'Oyun modları',
  title: 'Aynı bilgi, farklı sorular',
  lede: 'Takım eşleşmesini ezberlediysen ülke ve harf modları seni yeniden zorlar.',
})}
${cards(MODES.slice(0, 3).map((m) => ({ ...m, href: '/oyun-modlari/' })))}
<div class="center" style="margin-top:26px">
<a class="btn btn-ghost" href="/oyun-modlari/">Altı modun hepsi ${icons.arrow}</a>
</div>
</div>
</section>

<section class="section">
<div class="wrap">
${head({
  eyebrow: 'Kaputun altında',
  title: 'Tartışma çıkmaz, kayıt konuşur',
  lede: 'Ortak futbolcu oyununun sohbette çözülemeyen kısmı hakemlik. Burada hakem sunucu.',
})}
${cards(FEATURES)}
</div>
</section>

<section class="section">
<div class="wrap">
${head({
  eyebrow: 'Ortak futbolcu arşivi',
  title: 'Hangi ikilide kimler oynadı?',
  lede: 'Oyunu besleyen kariyer arşivini açtık. Kulüp eşleşmesini seç, ikisinde de forma giymiş herkesi yıllarıyla gör.',
})}
${pairList(featured, clubs)}
<div class="center btn-row" style="margin-top:26px;justify-content:center">
<a class="btn btn-gold" href="/ortak-futbolcu-bulucu/">${icons.search} Ortak futbolcu bulucu</a>
<a class="btn btn-ghost" href="/ortak-futbolcu/">Tüm kulüp eşleşmeleri ${icons.arrow}</a>
</div>
</div>
</section>

<section class="section">
<div class="wrap wrap-narrow">
${head({ eyebrow: 'SSS', title: 'Sık sorulanlar' })}
${faq(HOME_FAQ)}
<p class="center small muted" style="margin-top:22px"><a href="/sss/" style="color:var(--gold)">Tüm soruları gör →</a></p>
</div>
</section>

${band('tr', {
  title: 'Rakibini bul, bilgini kanıtla',
  lede: 'Kurulum yok, hesap zorunluluğu yok. Aç, eşleş, ilk turu oyna.',
})}`;

  return page({
    lang: 'tr',
    path: '/',
    altPath: '/en/',
    title,
    description,
    body,
    jsonld: [
      ldOrganization(),
      ldWebSite('tr'),
      ldApp('tr'),
      ldFaq(HOME_FAQ),
    ],
  });
}

// ---------------------------------------------------------------------------
export function howToPlay() {
  const FAQ = [
    [
      'Bir maç kaç tur sürüyor?',
      '<p>Üç turu ilk kazanan maçı alır. Her tur, takım seçimi ve tahmin aşamasıyla birlikte yaklaşık bir dakika sürer.</p>',
    ],
    [
      'Cevabı bilmiyorsam ne yapabilirim?',
      '<p>Pas geçebilirsin. Pas, turu rakibine bırakır ama süreyi boşa harcamana engel olur.</p>',
    ],
    [
      'Aynı futbolcuyu tekrar yazabilir miyim?',
      '<p>Bir tur içinde yanlış cevap verirsen tekrar deneyebilirsin; süre dolana kadar hakkın var. Turu kilitleyen ilk doğru cevaptır.</p>',
    ],
  ];

  const body = `
${crumbs([
  ['Ana Sayfa', '/'],
  ['Nasıl oynanır', '/nasil-oynanir/'],
])}
<section class="wrap section-tight">
${head({
  eyebrow: 'Nasıl oynanır',
  title: 'Ortak futbolcu oyunu nasıl oynanır?',
  lede: 'Kurallar bir cümlede biter: iki kulüpte de oynamış futbolcuyu rakibinden önce yaz. Aşağıda bir turun her aşaması, oyunun gerçek ekranlarıyla.',
  tag: 'h1',
})}
</section>

<section class="section-tight">
<div class="wrap">
<div class="grid g-3">
<div class="reveal">
${device('/img/screens/tr-pick.webp', 'Takım seçme ekranı: arama kutusu ve takım kartları')}
<div style="margin-top:18px">
<div class="eyebrow">01 — Seçim</div>
<h3 style="margin:8px 0">Takımını seç</h3>
<p class="muted small">Geri sayım bitince arama kutusu açılır. Kulübünü yaz, listeden seç. Rakibin ne seçtiğini bu aşamada göremezsin.</p>
</div>
</div>
<div class="reveal d1">
${device('/img/screens/tr-guess.webp', 'Tahmin ekranı: iki kulüp karşı karşıya, süre işliyor')}
<div style="margin-top:18px">
<div class="eyebrow">02 — Açılış</div>
<h3 style="margin:8px 0">İki takım karşı karşıya</h3>
<p class="muted small">Senin ve rakibinin kulübü aynı anda açılır, sayaç başlar. Artık tek iş var: ikisinde de forma giymiş bir isim bulmak.</p>
</div>
</div>
<div class="reveal d2">
${device('/img/screens/tr-result.webp', 'Sonuç ekranı: doğru cevap ve futbolcunun kariyeri')}
<div style="margin-top:18px">
<div class="eyebrow">03 — Sonuç</div>
<h3 style="margin:8px 0">Kariyer açılır</h3>
<p class="muted small">İlk doğru cevap turu kilitler ve futbolcunun kulüp geçmişi yıllarıyla listelenir. Bilmediğin bir transferi orada öğrenirsin.</p>
</div>
</div>
</div>
</div>
</section>

<section class="section">
<div class="wrap wrap-narrow">
<div class="panel pad-lg prose reveal">
<h2 style="margin-top:0">Puanlama ve kupalar</h2>
<p>Her tur bir puandır; <strong>üç turu ilk alan maçı kazanır.</strong> Dereceli maçlarda kazanan kupa toplar, kaybeden kupa verir. Kupa toplamın hangi arenada oynadığını belirler:</p>
<ol>
<li><strong>Mahalle Sahası</strong> — herkesin başladığı yer.</li>
<li><strong>Amatör Lig</strong> — ilk ciddi rakipler.</li>
<li><strong>Profesyonel Lig</strong> — transfer hafızası gerekmeye başlar.</li>
<li><strong>Şampiyonlar Ligi</strong> — dengeli ve hızlı.</li>
<li><strong>Efsaneler Arası</strong> — kayıplar acıtır.</li>
<li><strong>Dünya Klasmanı</strong> — her hata pahalı.</li>
<li><strong>GOAT</strong> — sadece en iyiler kalır.</li>
</ol>
<h2>Cevap nasıl doğrulanıyor?</h2>
<p>Yazdığın isim sunucuya gider ve futbolcunun her iki kulüpteki kayıtlı dönemlerine bakılır. Bu kontrol <strong>tek bir doğruluk kaynağından</strong> yapılır, iki oyuncu için de aynıdır ve turu kimin kilitlediği sunucuda karara bağlanır — yani bağlantısı daha hızlı olan avantaj kazanmaz.</p>
<p>İsim eşleştirme bilerek toleranslıdır. Türkçe karakter, aksan ve yaygın yazım hataları normalize edilir; “gundogan” yazman <strong>İlkay Gündoğan</strong> için yeterlidir. Altyapıda veya kiralık geçirilen dönemler de ana kulübe sayılır: bir maç bile o formayla sahaya çıktıysa geçerlidir.</p>
<h2>Pas geçmek ve süre</h2>
<p>Cevabın gelmiyorsa pas geçebilirsin. Pas turu bitirmez; rakibine cevap için alan bırakır. Süre dolarsa tur kimseye yazılmaz ve yeni tur başlar.</p>
</div>
</div>
</section>

<section class="section-tight">
<div class="wrap wrap-narrow">
${head({ eyebrow: 'SSS', title: 'Tur kuralları hakkında' })}
${faq(FAQ)}
</div>
</section>

${band('tr', {
  title: 'İlk turunu şimdi oyna',
  lede: 'Bota karşı ısın, sonra canlı rakibe geç.',
})}`;

  return page({
    lang: 'tr',
    path: '/nasil-oynanir/',
    altPath: '/en/how-to-play/',
    title: 'Nasıl Oynanır — Ortak Futbolcu Oyununun Kuralları | CrossOver Football',
    description:
      'Takım seç, iki kulüp açılsın, ikisinde de oynamış futbolcuyu ilk sen yaz. Turlar, puanlama, arenalar ve cevap doğrulaması adım adım anlatılıyor.',
    body,
    jsonld: [
      ldBreadcrumb([
        ['Ana Sayfa', '/'],
        ['Nasıl oynanır', '/nasil-oynanir/'],
      ]),
      ldFaq(FAQ),
      ldApp('tr'),
    ],
  });
}

// ---------------------------------------------------------------------------
export function gameModes() {
  const body = `
${crumbs([
  ['Ana Sayfa', '/'],
  ['Oyun modları', '/oyun-modlari/'],
])}
<section class="wrap section-tight">
${head({
  eyebrow: 'Oyun modları',
  title: 'Altı farklı oynanış',
  lede: 'Hepsi aynı bilgiyi ölçer ama farklı yerinden tutar. Takım eşleşmesi ısınma, harf modu sınavdır.',
  tag: 'h1',
})}
</section>

<section class="section-tight">
<div class="wrap">
${cards(MODES)}
<p class="small dim center" style="margin-top:24px">Ülke × Takım ve Harf × Takım, Sosyal Paket aboneliğiyle açılır ve eşleşme için iki oyuncuda da aktif olmalıdır.</p>
</div>
</section>

<section class="section">
<div class="wrap">
<div class="grid g-2" style="align-items:center">
<div class="reveal">
${device('/img/screens/tr-arenas.webp', 'Arena ekranı: Mahalle Sahası’ndan GOAT’a kadar yedi basamak')}
</div>
<div class="reveal d1">
<span class="eyebrow">Dereceli maç</span>
<h2 style="margin:12px 0 14px">Kupa topla, arena atla</h2>
<p class="lede">Dereceli maçlarda her galibiyet kupa kazandırır. Kupa toplamın yükseldikçe yeni arenalar açılır ve rakiplerin sertleşir. Mahalle Sahası’nda transfer hafızası yeterken GOAT arenasında hız da gerekir.</p>
<p class="muted small" style="margin-top:14px">Arena atladığında elmas ödülü alırsın; düşüş de mümkündür, kupa kaybedersin.</p>
</div>
</div>
</div>
</section>

<section class="section">
<div class="wrap">
<div class="grid g-2" style="align-items:center">
<div class="reveal d1" style="order:1">
<span class="eyebrow">Arkadaşlar</span>
<h2 style="margin:12px 0 14px">Asıl rekabet tanıdıklarla</h2>
<p class="lede">Arkadaş ekle, dostluk maçı daveti gönder ya da oda kodunu paylaş. Dostluk maçlarında kupa yoktur — sadece iddia vardır.</p>
<p class="muted small" style="margin-top:14px">Mesajlaşma ve arkadaş ekleme yalnızca Apple veya Google ile giriş yapmış doğrulanmış hesaplara açıktır.</p>
</div>
<div class="reveal" style="order:2">
${device('/img/screens/tr-friends.webp', 'Arkadaşlar ekranı: arkadaş listesi ve dostluk maçı daveti')}
</div>
</div>
</div>
</section>

${band('tr', {
  title: 'Modunu seç, sahaya in',
  lede: 'Takım × Takım ücretsiz. Gerisi ne kadar iddialı olduğuna bağlı.',
})}`;

  return page({
    lang: 'tr',
    path: '/oyun-modlari/',
    altPath: '/en/game-modes/',
    title: 'Oyun Modları — Takım, Ülke, Harf ve Bot Maçı | CrossOver Football',
    description:
      'Takım × Takım, Ülke × Takım, Harf × Takım, bot maçı, dereceli maç ve dostluk maçı. CrossOver Football’ın tüm oyun modları ve arena sistemi.',
    body,
    jsonld: [
      ldBreadcrumb([
        ['Ana Sayfa', '/'],
        ['Oyun modları', '/oyun-modlari/'],
      ]),
      ldApp('tr'),
    ],
  });
}

// ---------------------------------------------------------------------------
export function download() {
  const body = `
${crumbs([
  ['Ana Sayfa', '/'],
  ['İndir', '/indir/'],
])}
<section class="wrap section-tight">
<div class="hero-grid" style="align-items:center">
<div>
<span class="eyebrow reveal">Ücretsiz indir</span>
<h1 class="reveal d1" style="margin:14px 0 18px">Bir maç üç dakika sürer.<br /><span class="gold">Bir tartışma ömür boyu.</span></h1>
<p class="lede reveal d2">CrossOver Football iOS’ta ücretsiz. İndir, eşleş, ilk turu oyna. Hesap açmadan da oynayabilirsin.</p>
<div class="reveal d3" style="margin-top:26px">
${storeButtons('tr', { ev: 'download_page_click' })}
</div>
<p class="muted small reveal d3" style="margin-top:18px">iOS 15.1 ve üzeri · Türkçe, İngilizce ve 18 dil daha · Uygulama içi satın alım içerir</p>
</div>
<div class="hero-art">
${device('/img/screens/tr-result.webp', 'Doğru cevap ekranı ve futbolcunun kariyer dökümü', { eager: true })}
</div>
</div>
</section>

<section class="section">
<div class="wrap">
${head({
  eyebrow: 'İndirdikten sonra',
  title: 'İlk beş dakikan',
})}
${steps([
  {
    title: 'Bota karşı ısın',
    body: 'Kupa riski yok. Kolay botla bir maç oyna, arayüzü ve süreyi tanı.',
  },
  {
    title: 'Hemen Oyna’ya bas',
    body: 'Canlı rakibe eşleş. İlk dereceli galibiyetinle kupa hesabın açılır.',
  },
  {
    title: 'Arkadaşını çağır',
    body: 'Oda kodunu paylaş ya da arkadaş ekleyip dostluk maçı daveti gönder.',
  },
])}
</div>
</section>

<section class="section-tight">
<div class="wrap wrap-narrow">
<div class="panel panel-accent is-mint pad-lg reveal">
<h2 style="font-size:1.4rem;margin-bottom:12px">Android sürümü ne zaman?</h2>
<p class="muted">Android sürümü hazırlanıyor ancak henüz Google Play’de yayında değil. Çıktığı gün bu sayfadaki düğme aktif olacak — sahte bir bağlantı koymuyoruz.</p>
</div>
</div>
</section>

${band('tr', {
  title: 'Sıradaki tur seni bekliyor',
  lede: 'İki kulüp açılacak. Ortak ismi ilk sen yaz.',
})}`;

  return page({
    lang: 'tr',
    path: '/indir/',
    altPath: '/en/download/',
    title: 'CrossOver Football İndir — Ücretsiz Futbol Bilgi Oyunu (iOS)',
    description:
      'CrossOver Football’ı App Store’dan ücretsiz indir. Ortak futbolcu bulma oyununu canlı rakiplere ya da bota karşı oyna. Android sürümü yakında.',
    body,
    jsonld: [
      ldBreadcrumb([
        ['Ana Sayfa', '/'],
        ['İndir', '/indir/'],
      ]),
      ldApp('tr'),
    ],
  });
}


// ---------------------------------------------------------------------------
// /ortak-futbolcu-bulucu/ — the interactive tool. Two selects, one fetch per
// chosen pairing (~1-2 KB), results rendered client-side. The page itself
// still carries crawlable copy + links, so it ranks for "ortak futbolcu
// bulucu" style searches even though the tool needs JS.
// ---------------------------------------------------------------------------
export function finderTool({ totals, clubs, pairCount }) {
  const trClubs = clubs.filter((c) => c.country === 'Türkiye').length;
  const body = `
${crumbs([
  ['Ana Sayfa', '/'],
  ['Ortak futbolcu bulucu', '/ortak-futbolcu-bulucu/'],
])}
<section class="wrap section-tight">
${head({
  eyebrow: 'Araç',
  title: 'Ortak futbolcu bulucu',
  lede: `İki kulüp seç; ikisinde de forma giymiş herkesi sezonlarıyla gör. ${clubs.length} kulüp, ${pairCount.toLocaleString('tr-TR')} eşleşme — hepsi gerçek kariyer arşivinden.`,
  tag: 'h1',
})}
</section>

<section class="section-tight" style="padding-top:0">
<div class="wrap wrap-narrow">
<div class="panel pad-lg reveal">
<div class="grid g-2" style="align-items:end">
<div>
<label for="clubA" class="eyebrow" style="display:block;margin-bottom:10px">1. Takım</label>
<select id="clubA" class="well" style="width:100%;padding:14px 16px;color:var(--text);border:0;font:inherit;font-weight:600;border-radius:var(--r)"></select>
</div>
<div>
<label for="clubB" class="eyebrow" style="display:block;margin-bottom:10px">2. Takım</label>
<select id="clubB" class="well" style="width:100%;padding:14px 16px;color:var(--text);border:0;font:inherit;font-weight:600;border-radius:var(--r)"></select>
</div>
</div>
<div id="finderOut" style="margin-top:22px" aria-live="polite">
<p class="muted small" style="margin:0">İki takım seç — sonuç anında burada açılır.</p>
</div>
</div>
<noscript><p class="small dim" style="margin-top:14px">Bu araç JavaScript ister. Alternatif: <a href="/ortak-futbolcu/" style="color:var(--gold)">hazır eşleşme listeleri</a>.</p></noscript>
</div>
</section>

<section class="section-tight">
<div class="wrap wrap-narrow">
<div class="panel pad-lg prose reveal">
<h2 style="margin-top:0">Bu araç ne yapar?</h2>
<p>Sohbette "ortak futbolcu" oynarken cevap tartışması çıktığında hakem burasıdır: seçtiğin iki kulübün <strong>ikisinde de forma giymiş her futbolcuyu</strong>, kulüplerdeki ilk ve son kayıtlı sezonlarıyla listeler. Kiralık ve altyapı dönemleri ana kulübe sayılır — <a href="/nasil-oynanir/">oyundaki doğrulama</a> da aynı kuralı uygular.</p>
<p>Veri, CrossOver Football'ın cevapları doğrularken kullandığı arşivden gelir: ${totals.players.toLocaleString('tr-TR')} futbolcu, ${totals.spells.toLocaleString('tr-TR')} kariyer dönemi. Havuzda ${trClubs} Türk kulübü dahil ${clubs.length} kulüp var; aradığın ikili yoksa <a href="/ortak-futbolcu/">arşiv sayfasına</a> bak ya da eksik kulübü <a href="/destek/">bize yaz</a>.</p>
</div>
</div>
</section>

${band('tr', {
  title: 'Cevabı bulmak kolay, ilk bulmak zor',
  lede: 'Aynı soruyu 12 saniyede, canlı rakibe karşı cevaplayabilir misin?',
})}
<script>
(function () {
  var base = '/ortak-futbolcu/_data/';
  var A = document.getElementById('clubA'), B = document.getElementById('clubB'), out = document.getElementById('finderOut');
  var idx = null;
  fetch(base + 'index.json').then(function (r) { return r.json(); }).then(function (d) {
    idx = d; idx.set = new Set(d.pairs);
    var groups = {};
    d.clubs.forEach(function (c) { (groups[c.k] = groups[c.k] || []).push(c); });
    ['Türkiye'].concat(Object.keys(groups).filter(function (k) { return k !== 'Türkiye'; }).sort()).forEach(function (k) {
      [A, B].forEach(function (sel) {
        var og = document.createElement('optgroup'); og.label = k;
        groups[k].slice().sort(function (x, y) { return x.n.localeCompare(y.n, 'tr'); }).forEach(function (c) {
          var o = document.createElement('option'); o.value = c.s; o.textContent = c.n; og.appendChild(o);
        });
        sel.appendChild(og);
      });
    });
    var ph = function (sel, txt) { var o = document.createElement('option'); o.value = ''; o.textContent = txt; o.selected = true; sel.insertBefore(o, sel.firstChild); };
    ph(A, 'Takım seç…'); ph(B, 'Takım seç…');
  });
  function esc(t) { var d = document.createElement('i'); d.textContent = t; return d.innerHTML; }
  function span(l) { return l.map(function (s) { var f = s[0], t = s[1]; if (f == null && t == null) return '—'; if (f == null) return '→ ' + t; if (t == null || t === f) return '' + f; return f + '–' + t; }).join(' · ') || '—'; }
  var seq = 0; // hızlı seçim değişiminde geciken eski fetch, yeni sonucu ezmesin
  function go() {
    if (!idx || !A.value || !B.value) return;
    var my = ++seq;
    if (A.value === B.value) { out.innerHTML = '<p class="muted small" style="margin:0">İki farklı takım seç.</p>'; return; }
    var key = idx.set.has(A.value + '__' + B.value) ? A.value + '__' + B.value : (idx.set.has(B.value + '__' + A.value) ? B.value + '__' + A.value : null);
    var nA = A.options[A.selectedIndex].text, nB = B.options[B.selectedIndex].text;
    if (!key) { out.innerHTML = '<p class="muted" style="margin:0"><strong>' + esc(nA) + ' × ' + esc(nB) + '</strong>: arşivde 5\u2019ten az ortak futbolcu var — oyunun en zor eşleşmelerinden. <a href="/rehber/zor-ortak-futbolcu-eslesmeleri/" style="color:var(--gold)">Zor eşleşmeler rehberine</a> bak.</p>'; return; }
    out.innerHTML = '<p class="muted small" style="margin:0">Aranıyor…</p>';
    fetch(base + key + '.json').then(function (r) { return r.json(); }).then(function (d) {
      if (my !== seq) return; // bu cevap artık güncel değil
      var flip = key.indexOf(A.value) !== 0;
      var rows = d.players.map(function (p, i) {
        var l = flip ? p.b : p.a, r2 = flip ? p.a : p.b;
        return '<tr><td><div style="display:flex;align-items:center;gap:11px"><span class="rank">' + (i + 1) + '</span><span><span class="who">' + esc(p.n) + '</span>' + (p.c ? '<span class="nat">' + esc(p.c) + '</span>' : '') + '</span></div></td><td class="yr">' + span(l) + '</td><td class="yr">' + span(r2) + '</td></tr>';
      }).join('');
      // tek tırnaklı href: build denetimi statik href="…" desenlerini tarar,
      // JS'in ürettiği bu bağlantıyı yanlış pozitif olarak yakalamasın
      var pageLink = d.page ? "<p class=\\"small\\" style=\\"margin:14px 0 0\\"><a href='/ortak-futbolcu/" + d.a + '-' + d.b + "/' style='color:var(--gold)'>Bu eşleşmenin tam sayfası →</a></p>" : '';
      out.innerHTML = '<p style="margin:0 0 12px"><strong>' + d.players.length + ' futbolcu</strong> iki formayı da giymiş:</p>'
        + '<div class="tbl-wrap well" style="border-radius:var(--r)"><table class="tbl"><thead><tr><th>Futbolcu</th><th>' + esc(nA) + '</th><th>' + esc(nB) + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' + pageLink;
      if (typeof window.gtag === 'function') window.gtag('event', 'finder_lookup', { pair: key });
    });
  }
  A.addEventListener('change', go); B.addEventListener('change', go);
})();
</script>`;

  return page({
    lang: 'tr',
    path: '/ortak-futbolcu-bulucu/',
    title: 'Ortak Futbolcu Bulucu — İki Takım Seç, Ortak Oyuncuyu Gör',
    description:
      'İki kulüp seç, ikisinde de forma giymiş futbolcuları sezonlarıyla anında gör. Gerçek kariyer arşivine dayanan ücretsiz ortak futbolcu bulma aracı.',
    body,
    jsonld: [
      ldBreadcrumb([
        ['Ana Sayfa', '/'],
        ['Ortak futbolcu bulucu', '/ortak-futbolcu-bulucu/'],
      ]),
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'Ortak Futbolcu Bulucu',
        url: `${SITE}/ortak-futbolcu-bulucu/`,
        applicationCategory: 'SportsApplication',
        operatingSystem: 'Web',
        offers: { '@type': 'Offer', 'price': '0', 'priceCurrency': 'TRY' },
        publisher: { '@id': `${SITE}/#organization` },
      },
      ldApp('tr'),
    ],
  });
}

export { MODES, FEATURES, HOME_FAQ };
