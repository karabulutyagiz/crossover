// The three cluster landing pages and the full FAQ.
//
// Each landing page answers a different question, because the searches behind
// them are different: "ortak futbolcu oyunu" wants the game and its rules,
// "futbolcu bilme oyunu" is comparing formats, "futbol bilgi oyunu" wants to
// test and improve. Same product, three genuinely different pages — no page
// here is a keyword-swapped copy of another.

import {
  page,
  icons,
  ldApp,
  ldBreadcrumb,
  ldFaq,
} from '../lib/layout.mjs';
import { head, crumbs, storeButtons, faq, band, duel, pairList, device } from '../lib/ui.mjs';

// ---------------------------------------------------------------------------
// CLUSTER A — ortak futbolcu
// ---------------------------------------------------------------------------
export function ortakFutbolcuOyunu({ featured, clubs, heroPairs, totals }) {
  const FAQ = [
    [
      'Ortak futbolcu oyunu nasıl oynanır?',
      '<p>İki oyuncu birer kulüp söyler. Amaç, <strong>her iki kulüpte de forma giymiş</strong> bir futbolcunun adını rakipten önce söylemektir. Doğru ismi ilk veren turu kazanır, sonra yeni bir eşleşme açılır. Sohbette oynarken hakem yoktur; CrossOver Football’da cevabı kariyer kayıtları doğrular.</p>',
    ],
    [
      'İki takımda da oynayan futbolcu nasıl bulunur?',
      '<p>Üç yol işe yarar: <strong>transfer yolunu takip et</strong> (bir kulüpten çıkan oyuncu genelde aynı ligin ya da aynı seviyedeki bir kulübün kapısını çalar), <strong>kiralıkları hatırla</strong> (kısa dönemler en çok unutulanlardır) ve <strong>kariyer sonu duraklarını düşün</strong> (Süper Lig, birçok Avrupalı ismin son durağıdır).</p>',
    ],
    [
      'Kaç kişiyle oynanır?',
      '<p>Klasik hâli iki kişiliktir. CrossOver Football’da canlı rakiple 1v1, arkadaşınla oda kodu üzerinden özel maç ya da tek başına bota karşı oynayabilirsin.</p>',
    ],
    [
      'Kiralık ve altyapı dönemleri sayılır mı?',
      '<p>Sayılır. Bir futbolcu o kulübün formasıyla resmî maça çıktıysa geçerlidir; kiralık ve altyapıdan yükselen dönemler de ana kulübe yazılır.</p>',
    ],
  ];

  const body = `
${crumbs([
  ['Ana Sayfa', '/'],
  ['Ortak futbolcu oyunu', '/ortak-futbolcu-oyunu/'],
])}
<section class="wrap section-tight">
<div class="hero-grid" style="align-items:center">
<div>
<span class="eyebrow reveal">Ücretsiz · iOS</span>
<h1 class="reveal d1" style="margin:14px 0 18px">Ortak futbolcu oyunu</h1>
<p class="lede reveal d2">İki kulüp söylenir, ikisinde de oynamış futbolcuyu ilk bulan kazanır. Otobüste, kahvede ve grup sohbetlerinde yıllardır oynanan oyunun kurallı hâli — cevapları tartışmaya bırakmayan bir hakemle.</p>
<div class="reveal d3" style="margin-top:24px">${storeButtons('tr', { ev: 'clusterA_install' })}</div>
</div>
<div class="hero-art">
${duel({ ...heroPairs[0], hint: 'Gerçek bir tur: cevap kariyer arşivinden doğrulandı.' })}
</div>
</div>
</section>

<section class="section-tight">
<div class="wrap wrap-narrow">
<div class="panel pad-lg prose reveal">
<h2 style="margin-top:0">Oyunun kuralı tek cümle</h2>
<p><strong>İki kulüp. İkisinde de forma giymiş bir futbolcu. İlk söyleyen kazanır.</strong></p>
<p>Bu kadar. Oyunun güzelliği de zorluğu da burada: kuralı öğrenmek beş saniye sürer, iyi oynamak yıllar süren bir transfer hafızası ister. “Galatasaray – Inter” dendiğinde aklına Wesley Sneijder geliyorsa iyisindir; “Beşiktaş – Barcelona” dendiğinde Ricardo Quaresma’yı çıkarabiliyorsan sohbetin en tehlikeli adamısın.</p>
<h2>Sohbette oynarken çıkan üç sorun</h2>
<ol>
<li><strong>Hakem yok.</strong> “Kiralıktı, sayılmaz” tartışması oyunu bitirir.</li>
<li><strong>Doğrulama yok.</strong> Kimse Rüştü Reçber’in Barcelona sezonunu telefondan aramak istemez.</li>
<li><strong>Kayıt yok.</strong> Kimin kaç tur aldığını üç tur sonra hatırlayan olmaz.</li>
</ol>
<p>CrossOver Football tam olarak bu üç boşluğu kapatmak için var. Cevabın doğruluğuna sunucu karar verir, kararı <strong>${totals.spells.toLocaleString('tr-TR')} kariyer dönemi</strong> içeren bir arşive dayandırır, skoru da kendisi tutar.</p>
<h2>Nasıl daha iyi olunur?</h2>
<p>Bu oyunda “çok maç izlemek” tek başına yetmez; <strong>transfer yollarını</strong> ezberlemek gerekir. İşe yarayan üç refleks:</p>
<ul>
<li><strong>Köprü kulüpleri tanı.</strong> Bazı kulüpler transfer trafiğinin kavşağıdır. Süper Lig ekipleri, Premier Lig’in orta sıralarıyla ve Serie A’yla sürekli oyuncu takas eder — “Beşiktaş – Chelsea” gibi ilk bakışta uzak duran eşleşmelerin cevabı çoğu zaman oradan çıkar.</li>
<li><strong>Kariyer sonu duraklarını düşün.</strong> Avrupa’da yıldızlaşmış birçok ismin son iki sezonu Türkiye’de geçti. Bir Avrupa devi ile bir Süper Lig kulübü eşleştiğinde önce bu grubu tara.</li>
<li><strong>Kısa dönemleri unutma.</strong> Yarım sezonluk kiralıklar en çok kaçırılan cevaplardır; oyunu kazandıran da genelde onlardır.</li>
</ul>
</div>
</div>
</section>

<section class="section">
<div class="wrap">
${head({
  eyebrow: 'Arşiv',
  title: 'Popüler kulüp eşleşmeleri',
  lede: 'Merak ettiğin ikiliyi seç: ikisinde de forma giymiş herkes, ilk ve son sezonlarıyla listelenir.',
})}
${pairList(featured, clubs)}
<div class="center btn-row" style="margin-top:26px;justify-content:center">
<a class="btn btn-gold" href="/ortak-futbolcu-bulucu/">${icons.search} Ortak futbolcu bulucu</a>
<a class="btn btn-ghost" href="/ortak-futbolcu/">Tüm eşleşmeler ${icons.arrow}</a>
</div>
</div>
</section>

<section class="section-tight">
<div class="wrap wrap-narrow">
${head({ eyebrow: 'SSS', title: 'Ortak futbolcu oyunu hakkında' })}
${faq(FAQ)}
</div>
</section>

${band('tr', {
  title: 'Tartışmayı bitir, oynamaya başla',
  lede: 'Hakem sunucuda. Sen sadece ismi bul.',
})}`;

  return page({
    lang: 'tr',
    path: '/ortak-futbolcu-oyunu/',
    title: 'Ortak Futbolcu Bilme Oyunu — Ücretsiz Oyna, Canlı 1v1',
    description:
      'İki takımda da oynamış futbolcuyu rakibinden önce bul. Canlı 1v1 ortak futbolcu bilme oyunu, gerçek transfer verisiyle. iOS’ta ücretsiz, kurallar da burada.',
    body,
    jsonld: [
      ldBreadcrumb([
        ['Ana Sayfa', '/'],
        ['Ortak futbolcu oyunu', '/ortak-futbolcu-oyunu/'],
      ]),
      ldFaq(FAQ),
      ldApp('tr'),
    ],
  });
}

// ---------------------------------------------------------------------------
// CLUSTER B — futbolcu bilme
// ---------------------------------------------------------------------------
export function futbolcuBilmeOyunu() {
  const FAQ = [
    [
      'Futbolcu bilme oyunu nedir?',
      '<p>Bir futbolcuyu ipuçlarından çıkarmaya dayanan oyunların ortak adı. İpucu kimi zaman bulanık bir fotoğraf, kimi zaman kariyer listesi, kimi zaman da oyuncunun forma giydiği iki kulüptür.</p>',
    ],
    [
      'En zor futbolcu bilme oyunu hangisi?',
      '<p>Ölçüt “ne kadar ezber gerektirdiği” ise ortak futbolcu formatı öndedir: tek bir oyuncuyu değil, iki kulübün tüm kadro geçmişinin kesişimini hatırlaman gerekir. Fotoğraf tabanlı oyunlarda yüz tanıma yeterken burada transfer bilgisi şart.</p>',
    ],
    [
      'İki kişi karşılıklı oynanabilen futbolcu oyunu var mı?',
      '<p>Var. CrossOver Football’ın tamamı karşılıklı oynanır: canlı rakiple 1v1 eşleşirsin, arkadaşınla oda kodundan özel maç kurarsın ya da bota karşı çalışırsın.</p>',
    ],
  ];

  const body = `
${crumbs([
  ['Ana Sayfa', '/'],
  ['Futbolcu bilme oyunu', '/futbolcu-bilme-oyunu/'],
])}
<section class="wrap section-tight">
${head({
  eyebrow: 'Ücretsiz · iOS',
  title: 'Futbolcu bilme oyunu',
  lede: 'Fotoğraftan tahmin, kariyerden tahmin, harften tahmin, ortak kulüpten tahmin… Formatlar farklı, ölçtükleri şey aynı değil. Hangisi sana göre?',
  tag: 'h1',
})}
</section>

<section class="section-tight">
<div class="wrap">
<div class="panel tbl-wrap reveal">
<table class="tbl">
<thead><tr>
<th scope="col">Format</th>
<th scope="col">İpucu</th>
<th scope="col">Ölçtüğü şey</th>
</tr></thead>
<tbody>
<tr><td><span class="who">Fotoğraftan tahmin</span></td><td class="yr">Bulanık / kırpılmış görsel</td><td class="yr">Yüz hafızası</td></tr>
<tr><td><span class="who">Kariyerden tahmin</span></td><td class="yr">Kulüp listesi, uyruk, mevki</td><td class="yr">Kariyer takibi</td></tr>
<tr><td><span class="who">Harf oyunu</span></td><td class="yr">Baş harf + kulüp</td><td class="yr">Kadro derinliği</td></tr>
<tr><td><span class="who">Ortak futbolcu</span></td><td class="yr">İki kulüp</td><td class="yr">Transfer hafızası</td></tr>
</tbody>
</table>
</div>
<p class="small dim" style="margin-top:12px">CrossOver Football son üç satırı da kapsar: Takım × Takım, Harf × Takım ve Ülke × Takım modları.</p>
</div>
</section>

<section class="section">
<div class="wrap wrap-narrow">
<div class="panel pad-lg prose reveal">
<h2 style="margin-top:0">Neden ortak futbolcu formatı daha zor?</h2>
<p>Fotoğraftan tahminde tek bir doğru cevap vardır ve onu ya tanırsın ya tanımazsın. Ortak futbolcuda ise <strong>arama uzayı iki kadronun kesişimidir</strong>: “Fenerbahçe – Real Madrid” dendiğinde beynin iki ayrı kulüp tarihini tarayıp ortak isimleri çıkarmak zorunda. Cevap tek değildir — birden fazla doğru vardır ve hepsini bilen değil, birini <em>ilk</em> söyleyen kazanır.</p>
<p>Bu yüzden oyun aynı anda iki şeyi ölçer: <strong>bilgi</strong> ve <strong>erişim hızı</strong>. Bildiğin ismi 12 saniyede hatırlayamıyorsan bilmiyorsun sayılır.</p>
<h2>Tek başına mı, rakiple mi?</h2>
<p>Tek başına oynanan futbolcu bilme oyunları bir bulmacadır: kendi hızınla çözer, yanılırsan tekrar denersin. Rakiple oynandığında oyun bambaşka bir şeye dönüşür — rakibin de aynı cevabı arıyor olması, kolay eşleşmelerde bile baskı yaratır. CrossOver Football’ın bot modu birinci deneyimi, dereceli maçlar ikinciyi verir.</p>
<h2>Yazım hatası yüzünden tur kaybetmek</h2>
<p>Türkçe klavyede yabancı futbolcu adı yazmak başlı başına bir sınav. Bu yüzden isim eşleştirmesi bilerek toleranslı: aksan, Türkçe karakter ve yaygın yazım hataları normalize ediliyor. “snayder” yazsan da <strong>Wesley Sneijder</strong>’e gider. Amaç imlanı değil, futbol bilgini ölçmek.</p>
</div>
</div>
</section>

<section class="section-tight">
<div class="wrap">
<div class="grid g-2" style="align-items:center">
<div class="reveal">${device('/img/screens/tr-guess.webp', 'Tahmin ekranı: iki kulüp ve cevap alanı')}</div>
<div class="reveal d1">
<span class="eyebrow">Dene</span>
<h2 style="margin:12px 0 14px">Bilgini gerçek rakibe karşı ölç</h2>
<p class="lede">Tek kişilik bulmacalarda kaç doğru yaptığın seni yanıltabilir. Karşında aynı soruyu çözen biri varken gerçek seviyeni görürsün.</p>
<div style="margin-top:22px">${storeButtons('tr', { ev: 'clusterB_install', big: false })}</div>
</div>
</div>
</div>
</section>

<section class="section-tight">
<div class="wrap wrap-narrow">
${head({ eyebrow: 'SSS', title: 'Futbolcu bilme oyunları hakkında' })}
${faq(FAQ)}
</div>
</section>

${band('tr', {
  title: 'Hangi formatta iyisin?',
  lede: 'Üç modu da dene, kendi zayıf noktanı bul.',
})}`;

  return page({
    lang: 'tr',
    path: '/futbolcu-bilme-oyunu/',
    title: 'Futbolcu Bilme Oyunu — Ücretsiz Oyna, Gerçek Rakiple 1v1',
    description:
      'Futbolcu bilme oyununu gerçek rakiplere karşı ücretsiz oyna: ortak futbolcu, harf-takım, ülke-takım ve kariyer modları. iOS’ta indir, hemen başla.',
    body,
    jsonld: [
      ldBreadcrumb([
        ['Ana Sayfa', '/'],
        ['Futbolcu bilme oyunu', '/futbolcu-bilme-oyunu/'],
      ]),
      ldFaq(FAQ),
      ldApp('tr'),
    ],
  });
}

// ---------------------------------------------------------------------------
// CLUSTER C — futbol bilgi oyunu / yarışması
// ---------------------------------------------------------------------------
export function futbolBilgiOyunu({ totals }) {
  const FAQ = [
    [
      'Futbol bilgimi nasıl ölçebilirim?',
      '<p>Tek kişilik testler bilgi <em>tanımayı</em> ölçer, karşılıklı maçlar bilgi <em>hatırlamayı</em>. Gerçek seviyeni görmek istiyorsan süre baskısı altında ve rakiple oyna: bildiğini 12 saniyede çıkaramıyorsan o bilgi henüz erişilebilir değil.</p>',
    ],
    [
      'Futbol bilgi yarışması arkadaş grubuyla nasıl yapılır?',
      '<p>Oda kodu kur, kodu gruba at, herkes sırayla girsin. Dostluk maçlarında kupa kaybı olmadığı için turnuva formatı kurmak kolaydır.</p>',
    ],
    [
      'Futbol bilgisi nasıl geliştirilir?',
      '<p>Maç izlemek yetmez; <strong>kadro ve transfer takibi</strong> gerekir. Her hafta bir kulübün son on yıllık kadro geçişini okumak, aynı süreyi maç özeti izlemekten çok daha hızlı sonuç verir. <a href="/rehber/futbol-bilgini-gelistirme/">Rehberdeki yöntem</a> bunu bir rutine bağlıyor.</p>',
    ],
  ];

  const body = `
${crumbs([
  ['Ana Sayfa', '/'],
  ['Futbol bilgi oyunu', '/futbol-bilgi-oyunu/'],
])}
<section class="wrap section-tight">
${head({
  eyebrow: 'Ücretsiz · iOS',
  title: 'Futbol bilgi oyunu',
  lede: 'Herkes futboldan anladığını söyler. Ölçmenin yolu, bilgiyi süre baskısı altında ve bir rakibe karşı kullanmaktır.',
  tag: 'h1',
})}
</section>

<section class="section-tight">
<div class="wrap wrap-narrow">
<div class="panel pad-lg prose reveal">
<h2 style="margin-top:0">Bilgi mi, hatırlama hızı mı?</h2>
<p>Futbol bilgisi iki katmandan oluşur. Birincisi <strong>tanıma</strong>: bir isim gördüğünde hangi kulüplerde oynadığını bilirsin. İkincisi <strong>geri çağırma</strong>: elinde sadece iki kulüp varken doğru ismi hafızandan çekip çıkarırsın. İkincisi çok daha zordur ve gerçek futbol bilgisini asıl o ayırır.</p>
<p>CrossOver Football’ın ölçtüğü şey ikinci katman. Bir tur boyunca elinde yalnızca iki kulüp adı ve işleyen bir sayaç olur.</p>
<h2>Seviyeni nereden anlarsın?</h2>
<p>Arena basamakları bir ölçek işlevi görür. Kupa topladıkça yükselirsin:</p>
<table>
<thead><tr><th>Arena</th><th>Ne anlama gelir</th></tr></thead>
<tbody>
<tr><td><strong>Mahalle Sahası</strong></td><td>Büyük kulüplerin yıldız isimlerini biliyorsun.</td></tr>
<tr><td><strong>Profesyonel Lig</strong></td><td>Orta sıra kulüplerin kadro geçmişini de takip ediyorsun.</td></tr>
<tr><td><strong>Efsaneler Arası</strong></td><td>Kısa kiralıkları ve 2000’ler öncesini hatırlıyorsun.</td></tr>
<tr><td><strong>GOAT</strong></td><td>Hem biliyorsun hem saniyeler içinde erişiyorsun.</td></tr>
</tbody>
</table>
<h2>Bilgiyi büyütmenin en hızlı yolu</h2>
<p>Kaybettiğin turlar en iyi ders materyalidir: doğru cevap açıldığında futbolcunun tüm kulüp geçmişi yıllarıyla önüne gelir. Bilmediğin bir transferi tam da onu kaçırdığın anda öğrenirsin — bu yüzden akılda kalır.</p>
<p>Arşivin tamamı <strong>${totals.players.toLocaleString('tr-TR')} futbolcu</strong> ve <strong>${totals.clubs.toLocaleString('tr-TR')} kulüp</strong> içerir; yani öğrenecek şey uzun süre bitmez.</p>
</div>
</div>
</section>

<section class="section-tight">
<div class="wrap"><div class="center">${storeButtons('tr', { ev: 'clusterC_install' })}</div></div>
</section>

<section class="section-tight">
<div class="wrap wrap-narrow">
${head({ eyebrow: 'SSS', title: 'Futbol bilgisi hakkında' })}
${faq(FAQ)}
</div>
</section>

${band('tr', {
  title: 'Futbol bilgini kanıtla',
  lede: 'İddia herkes edebilir. Sayaç işlerken belli olur.',
})}`;

  return page({
    lang: 'tr',
    path: '/futbol-bilgi-oyunu/',
    title: 'Futbol Bilgi Oyunu — Ücretsiz Oyna, Canlı Rakiple Yarış',
    description:
      'Futbol bilgi oyununu ücretsiz oyna: canlı 1v1 düellolar, arena basamakları, kupalar. Bilgini süre baskısı altında gerçek rakiplere karşı ölç. iOS’ta ücretsiz.',
    body,
    jsonld: [
      ldBreadcrumb([
        ['Ana Sayfa', '/'],
        ['Futbol bilgi oyunu', '/futbol-bilgi-oyunu/'],
      ]),
      ldFaq(FAQ),
      ldApp('tr'),
    ],
  });
}

// ---------------------------------------------------------------------------
// Full FAQ page
// ---------------------------------------------------------------------------
export function sss() {
  const GROUPS = [
    [
      'Oyun',
      [
        [
          'CrossOver Football nasıl oynanır?',
          '<p>Her tur bir kulüp seçersin, rakibin de kendi kulübünü seçer. İki kulüp açıldığında ikisinde de forma giymiş bir futbolcunun adını yazarsın. İlk doğru cevap turu kilitler; üç turu ilk alan maçı kazanır. Ayrıntı: <a href="/nasil-oynanir/">Nasıl oynanır</a>.</p>',
        ],
        [
          'Hangi oyun modları var?',
          '<p>Takım × Takım (ücretsiz), Ülke × Takım ve Harf × Takım (Sosyal Paket), bot maçı, dereceli maç ve arkadaşlarla dostluk maçı. Hepsi: <a href="/oyun-modlari/">Oyun modları</a>.</p>',
        ],
        [
          'Kiralık ve altyapı dönemleri geçerli mi?',
          '<p>Evet. Futbolcu o kulübün formasıyla sahaya çıktıysa cevap doğru sayılır; kiralık ve altyapı dönemleri ana kulübe yazılır.</p>',
        ],
        [
          'Doğru yazdığım ismi neden kabul etmedi?',
          '<p>Çoğu durumda o futbolcunun iki kulüpten birinde kaydı yoktur — cevap açıldığında kariyerini görebilirsin. İsim eşleştirme yazım hatalarına toleranslıdır, dolayısıyla sorun genelde imla değildir. Yine de hatalı olduğunu düşündüğün bir sonuç varsa destek adresine yaz.</p>',
        ],
      ],
    ],
    [
      'Hesap ve satın alımlar',
      [
        [
          'Hesap açmadan oynayabilir miyim?',
          '<p>Evet, misafir olarak oyunun tamamını oynayabilirsin. Arkadaş ekleme ve mesajlaşma ise yalnızca Apple veya Google ile giriş yapmış doğrulanmış hesaplara açıktır.</p>',
        ],
        [
          'Oyun ücretli mi?',
          '<p>İndirmek ve oynamak ücretsiz. İsteğe bağlı elmas paketleri ve Ülke × Takım ile Harf × Takım modlarını açan Sosyal Paket aboneliği var.</p>',
        ],
        [
          'Satın alımı nasıl iade ederim?',
          '<p>Uygulama içi satın alımlar Apple üzerinden yapılır; iadeler de Apple tarafından yönetilir: <a href="https://reportaproblem.apple.com" rel="noopener nofollow" target="_blank">reportaproblem.apple.com</a>.</p>',
        ],
        [
          'Hesabımı nasıl silerim?',
          '<p>Uygulama içinden: Ana ekran → Ayarlar → Hesabı Sil. İşlem geri alınamaz. Ayrıntı: <a href="/gizlilik/">Gizlilik Politikası</a>.</p>',
        ],
      ],
    ],
    [
      'Teknik',
      [
        [
          'Android sürümü var mı?',
          '<p>Henüz yok. Uygulama şu an yalnızca iOS’ta yayında; Android sürümü hazırlanıyor.</p>',
        ],
        [
          'İnternetsiz oynanır mı?',
          '<p>Hayır. Hem dereceli maçlar hem bot maçı sunucu üzerinden doğrulandığı için bağlantı gerekir.</p>',
        ],
        [
          'Oyun hangi dilleri destekliyor?',
          '<p>Türkçe ve İngilizce başta olmak üzere 20 dil.</p>',
        ],
      ],
    ],
  ];

  const flat = GROUPS.flatMap(([, items]) => items);

  const body = `
${crumbs([
  ['Ana Sayfa', '/'],
  ['SSS', '/sss/'],
])}
<section class="wrap section-tight">
${head({
  eyebrow: 'SSS',
  title: 'Sıkça sorulan sorular',
  lede: 'Aradığını bulamazsan destek sayfasından bize yaz — genelde 1-2 iş günü içinde dönüyoruz.',
  tag: 'h1',
})}
</section>
${GROUPS.map(
  ([title, items]) => `<section class="section-tight">
<div class="wrap wrap-narrow">
<h2 style="font-size:1.35rem;margin-bottom:16px" class="reveal">${title}</h2>
${faq(items)}
</div>
</section>`,
).join('')}
${band('tr', { title: 'Başka sorun mu var?', lede: 'Destek sayfasından bize ulaş.' })}`;

  return page({
    lang: 'tr',
    path: '/sss/',
    altPath: '/en/faq/',
    title: 'Sıkça Sorulan Sorular | CrossOver Football',
    description:
      'CrossOver Football hakkında sık sorulan sorular: oyun kuralları, modlar, kiralık dönemler, hesap silme, satın alımlar ve Android sürümü.',
    body,
    jsonld: [
      ldBreadcrumb([
        ['Ana Sayfa', '/'],
        ['SSS', '/sss/'],
      ]),
      ldFaq(flat),
    ],
  });
}
