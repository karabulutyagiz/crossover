# Crossover Growth OS

CrossOver Football'un merkezi büyüme sistemi: futbol kitlesine platform-native
içerik üretir, insan onayından geçirir, resmi API'lerle yayınlar, tıklama →
store ziyareti → install → ilk maç zincirini ölçer ve her gün kendini optimize
eder. **Spam botu değildir** — tasarım ilkesi: *maximum relevant distribution*.

## Ne yapar
- **İçerik motoru**: Sorular uydurulmaz — oyunun kendi `clubs/players/player_clubs`
  verisinden gerçek "iki takımda da oynamış futbolcu" çiftleri çekilir.
  10 content pillar, hook/CTA havuzları, platform başına ayrı dil (X ≠ IG ≠ TG),
  media brief (9:16 reel storyboard'u) üretimi.
- **Yorgunluk motoru**: content_signature (hash) + metin benzerliği (eşik 0.85),
  30 günlük pencere. Aynı kombinasyon/kopya içerik tekrar üretilmez.
- **Onay paneli** (`/growth`): her aday içerik REQUIRES_APPROVAL ile doğar;
  APPROVE / EDIT / REJECT / RESCHEDULE. RBAC: ADMIN / MARKETING / VIEWER.
- **Yayın hattı**: Content → PlatformPolicy → Permission → DuplicateDetection →
  RateLimiter → Publisher. Bu zincirden geçmeyen hiçbir şey yayınlanamaz.
  Idempotency anahtarı çift yayını engeller; 429'da exponential backoff + jitter.
- **Provider'lar**: X (API v2, OAuth 1.0a), Telegram (Bot API, yalnız owned
  kanallar), Instagram (Graph API). Reddit/Discord/Ekşi/TikTok vb. → otomatik
  yayın YOK, insan görevi (manual task) üretilir.
- **Atıf**: her yayına UTM'li kısa link (`/r/<code>`): tıklama loglanır,
  UA'ya göre App Store / Play Store'a yönlenir. Install/ilk-maç sayıları
  MMP olmadan uydurulamayacağı için elle/API ile girilir (`source` alanı ayrık).
- **Öğrenme döngüsü**: günlük; pillar/hook/CTA/slot ağırlıkları ContentScore'a
  göre güncellenir (%80 exploit / %20 keşif, sönmeyen keşif tabanı).
- **Yorum fırsatları** (dashboard → Yorumlar): viral futbol videosu/tweet linki
  yapıştır → doğal TR yorum taslakları (cevap oyun DB'sinden doğrulanır, link
  yok, marka adı en fazla 1 varyantta). Onaylanan yanıt X'te resmi API ile
  otomatik gider (hedef başına TEK yanıt, varsayılan 6/gün + min 30 dk ara);
  IG/TikTok/YouTube resmi API'leri başkasının gönderisine yorumu desteklemediği
  için kopyala-yapıştır görevi açılır — ToS ihlali otomasyon YOK. X planı
  destekliyorsa "X'te fırsat ara" güncel futbol tweet'lerini keşfeder
  (Free tier'da arama yok; akış manuel linkle çalışır).

## Kurulum (lokal)
```bash
cd growth && cp .env.example .env   # DATABASE_URL + GROWTH_ADMIN_TOKEN doldur
npm install
npm run migrate                     # growth_* tabloları (idempotent)
npm run user -- sen@ornek.com sifre ADMIN
npm run dev                         # http://localhost:8090/growth
```

## Komutlar
| Komut | İş |
|---|---|
| `npm run plan` | Günlük içerik planını elle tetikle |
| `npm run test:invariants` | 52 saf-mantık invariant testi (DB'siz) |
| `npm run typecheck` | `tsc --noEmit` |

## Güvenlik ve uyum kuralları (pazarlık edilemez)
- Sahte hesap, CAPTCHA aşma, limit bypass, izinsiz DM, sahte engagement YOK.
- Topluluk varsayılanı `MANUAL_APPROVAL_REQUIRED`; `APPROVED` olmayan
  topluluğa gönderim pipeline'da engellenir. `DO_NOT_POST` mutlaktır.
- Token/sırlar yalnızca env/secret manager'da; DB'de tutulmaz.
- Her onay/yayın/izin değişikliği `growth_audit_logs`'a yazılır.
- Global emniyet tavanları provider limitlerinin üstüne çıkılmasına izin vermez.

## Deploy
`docker-compose.yml`'deki `growth` servisi oyunla aynı stack'te ama ayrı
container'da koşar. Caddy tarafı: `deploy/caddy-growth.snippet`
(growth.crossoverfootball.com). Oyun sunucusuna hiçbir dokunuş yoktur.

## Fazlar
- **Faz 1 (bu repo)**: X/IG/TG owned + içerik motoru + scheduler + onay paneli +
  UTM atıf + öğrenme döngüsü + topluluk CRM iskeleti.
- **Faz 2**: Reddit/Discord resmi API, topluluk keşif motoru, Ekşi fırsat planlayıcı.
- **Faz 3**: doğrulanmış gerçek-zaman futbol olayları (transfer/maç günü),
  A/B deney motoru, creator keşfi, store API'lerinden install ingest.
- **Faz 4**: performans tahmini + otomatik içerik planlama.
