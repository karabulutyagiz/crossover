# web/ — crossoverfootball.com kaynağı

`website/` klasörü **tamamen üretilmiş çıktıdır**; elle düzenlenmez. Kaynak burasıdır.

Site saf statik HTML olarak servis edilir: hiçbir sayfa istemcide render edilmez,
Googlebot ilk byte'ta bitmiş sayfayı görür, JavaScript kapalıyken de her şey okunur.

## Komutlar

```bash
node web/extract.mjs         # Postgres → web/data/football.json  (veri değişince)
python3 web/make-assets.py   # kaynak görseller → web/static/img/  (görsel değişince)
node web/build.mjs           # web/ → website/                    (her değişiklikte)
node web/check.mjs           # üretilen siteyi denetle             (build'den sonra)
```

Yerelde bakmak için:

```bash
cd website && python3 -m http.server 8099
```

nginx davranışını (404 sayfası, yönlendirmeler, önbellek) birebir denemek için:

```bash
docker run --rm -d -p 8098:80 --name cof-web-test \
  -v "$PWD/website:/usr/share/nginx/html:ro" \
  -v "$PWD/deploy/nginx-crossover-web.conf:/etc/nginx/conf.d/default.conf:ro" nginx:alpine
```

## Yapı

| Yol | İçerik |
|---|---|
| `build.mjs` | Tüm sayfaları üretir, sitemap + robots yazar |
| `extract.mjs` | `crossover_verify` veritabanından futbol verisini dondurur |
| `check.mjs` | Kırık link, çift başlık, eksik canonical, bozuk JSON-LD denetimi |
| `make-assets.py` | Ekran görüntüleri (WebP), marka görselleri, OG kartları |
| `lib/layout.mjs` | `<head>`, meta, JSON-LD, nav, footer |
| `lib/ui.mjs` | Bileşenler (düello kartı, tablo, SSS, mağaza düğmeleri…) |
| `pages/*.mjs` | Sayfa içerikleri — TR, EN, SEO cluster'ları, rehber, eşleşmeler |
| `legal/*.html` | Gizlilik/koşullar/destek/ebeveyn gövdeleri — **metin buradan değişir** |
| `static/` | CSS, JS, fontlar, görseller; olduğu gibi kopyalanır |
| `data/football.json` | Üretilen veri anlık görüntüsü (commit'lenir, build DB istemez) |

## Kurallar

**Futbol iddiaları veriden gelir.** `/ortak-futbolcu/` sayfalarındaki her isim ve yıl
`data/football.json` içindeki bir satıra dayanır. Ana sayfadaki üç örnek turun cevabı
build sırasında arşive karşı doğrulanır; tutmazsa **build hata verip durur.**

**Uydurma istatistik yok.** Sayfalarda geçen futbolcu/kulüp/dönem sayıları
`extract.mjs`'in saydığı gerçek satır sayılarıdır. Yıldız/yorum sayısı gibi
doğrulanamayan hiçbir alan JSON-LD'ye yazılmaz.

**Android düğmesi yalnızca uygulama gerçekten Play'de olduğunda çıkar.**
`lib/layout.mjs` içindeki `ANDROID_LIVE` bayrağı `true` yapıldığında "çok yakında"
etiketi yerine gerçek düğme render edilir.

**İnce sayfa üretilmez.** Bir kulüp eşleşmesi ancak yeterli doğrulanmış kariyer
varsa sayfa alır (Türk kulüpleri için 5, diğerleri için 12 ortak futbolcu).
Eşik `build.mjs` içindedir.

**Yasal metinler yeniden yazılmaz.** App Store incelemesi bu metinleri okudu ve
mağaza kaydı bunlara link veriyor; build yalnızca yeniden biçimlendirir.

## Yayına alma

`website/` klasörü sunucudaki `/opt/crossover/website` ile eşitlenir; nginx canlı
servis eder, restart gerekmez:

```bash
node web/build.mjs && node web/check.mjs
rsync -az --delete website/ root@168.222.180.190:/opt/crossover/website/
```

`--delete` önemli: eski sitenin artık üretilmeyen dosyaları (eski `screens/`,
`dogrulama/`, `ozellikler/` yolları) sunucuda kalmamalı.
