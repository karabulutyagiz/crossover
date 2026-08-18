# Crossover — sunucu dağıtımı (Docker)

AWS askıya alındı; sunucu **168.222.180.190** üzerinde, halihazırda **transyol**
projesinin çalıştığı makineye **izole** olarak taşındı.

## Çalışan mimari (canlı)

```
                  Internet  (tek IP: 168.222.180.190, tek 443)
                     │
            transyol-caddy-1  (80/443, otomatik TLS)   ← transyol'un Caddy'si
            ├── transyol.com / api / app  → transyol container'ları
            └── 168-222-180-190.nip.io    → crossover-app-1:8080   ← EKLENEN tek satır blok
                     │  (shared-net)
              crossover-app-1   (Node + tsx, :8080, ws + REST)
                     │  (crossover_internal — transyol göremez)
              crossover-db-1    (Postgres 16, kendi volume'u, seed'li)
```

**İzolasyon:** Crossover'ın kendi DB'si, kendi volume'u (`crossover_pgdata`), kendi
iç ağı (`crossover_internal`), kendi parolası var — transyol'un Postgres/Redis/
MinIO'suna hiç dokunmaz. Sunucuda host'a port açmaz. Tek IP'de 443 paylaşımı
zorunlu olduğu için **sadece** TLS yönlendirmesi transyol'un Caddy'sinde bir
**additive** blokla yapılır (transyol'un mevcut site'larını etkilemez; yedeği
`/root/transyol/Caddyfile.bak-crossover`).

## Dosyalar

```
crossover/
├─ docker-compose.yml          # db + app (kendi Caddy YOK; shared-net'e bağlanır)
├─ .env.docker.example         # -> .env örneği
└─ deploy/
   ├─ caddy-crossover.snippet   # transyol Caddyfile'ına eklenen blok
   ├─ seed/01-crossover.sql.gz  # eski DB'nin tam dökümü (~53k oyuncu, gitignored)
   └─ README.md
```

Sunucudaki konum: `/opt/crossover/` — `.env` orada (perm 600).

## Sıfırdan yeniden kurulum / başka sunucuya taşıma

```bash
# 1. Dosyaları kopyala (app/ ve website/ gereksiz)
rsync -az --exclude node_modules --exclude .git \
  docker-compose.yml .env.docker.example server deploy \
  root@SUNUCU:/opt/crossover/

# 2. .env oluştur (DOMAIN=YENI-IP.nip.io, güçlü POSTGRES_PASSWORD)
cd /opt/crossover && cp .env.docker.example .env && nano .env

# 3. shared-net yoksa oluştur (transyol'unki zaten 'external: true')
docker network create shared-net 2>/dev/null || true

# 4. Ayağa kaldır (ilk açılışta DB seed'den dolar)
docker compose up -d --build

# 5. Reverse proxy: transyol Caddy'sine blok ekle (yedek alarak)
cp /root/transyol/Caddyfile /root/transyol/Caddyfile.bak-crossover
cat /opt/crossover/deploy/caddy-crossover.snippet >> /root/transyol/Caddyfile
docker exec transyol-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

Doğrulama: `curl https://168-222-180-190.nip.io/health` → `{"ok":true,"rooms":0}`

## Günlük operasyon

```bash
cd /opt/crossover
docker compose ps
docker compose logs -f app
./deploy/safe-app-deploy.sh          # rooms=0 değilse app'i restart etmez
```

Canlı maç varken app container'ı recreate edilmez. `/health` çıktısındaki `rooms`
değeri `0` olmadan deploy/restart yapma; aksi halde aktif odadaki oyuncular düşer.
Script build öncesi ve restart hemen öncesi iki kez kontrol eder.

## Ölçekleme notu

Canlı oyun odaları, hızlı eşleşme kuyruğu ve reconnect grace state'i şu an
`crossover-app-1` Node sürecinin belleğinde tutulur. Bu yüzden mevcut mimaride
app servisini `--scale app=2` gibi birden fazla instance'a çıkarmayın: iki oyuncu
farklı process'lere düşerse oda, matchmaking ve reconnect state'i bölünür. Yatay
ölçekleme gerektiğinde önce sticky WebSocket yönlendirme + Redis/pubsub veya ortak
room store eklenmelidir.

## Hybrid matchmaking rollout

Yeni gerçek-oyuncu-öncelikli bot fallback sistemi server-side ayarlanır.
Mobil App Store build'i gerekmez; eski yüklü client'lar aynı `find_match` WebSocket
mesajını kullanır. Üretimde açık kalmalıdır; aksi halde düşük insan trafiğinde
oyuncular rakip beklerken takılabilir.

Canlı için önerilen ayar:

```bash
HYBRID_MATCHMAKING_ENABLED=1
BOT_FALLBACK_ENABLED=1
BOT_FALLBACK_PERCENTAGE=100
docker compose up -d --build app
```

Kademeli açma gerekiyorsa:

```bash
# 10% fallback: gerçek oyuncu bulunamazsa yalnız aramaların küçük bir kısmına bot girer
HYBRID_MATCHMAKING_ENABLED=1
BOT_FALLBACK_ENABLED=1
BOT_FALLBACK_PERCENTAGE=10
BOT_FALLBACK_MIN_DELAY_MS=1800
BOT_FALLBACK_MAX_DELAY_MS=3800
docker compose up -d app
```

Sonra aynı değişkenle `25`, `50`, `100` değerlerine çıkılabilir. Acil durumda
erken bot fallback kapatılabilir; timeout güvenlik ağı yine oyuncuyu beklemede
bırakmamak için bot başlatır:

```bash
HYBRID_MATCHMAKING_ENABLED=1
BOT_FALLBACK_ENABLED=0
BOT_FALLBACK_PERCENTAGE=0
docker compose up -d app
```

Önemli log event'leri:
`matchmaking_started`, `matchmaking_expanded`, `human_match_found`,
`bot_fallback_started`, `bot_match_started`, `matchmaking_cancelled`,
`matchmaking_timeout`, `duplicate_assignment_prevented`, `match_completed`,
`settlement_error`.

DB migration additive ve güvenlidir: `match_settlements` idempotency tablosu eklenir,
mevcut üretim kullanıcıları/kupaları/profilleri/maç geçmişi değiştirilmez veya silinmez.
Kod migration çalışmadan da in-memory guard ile çalışır, ancak production için migration
önerilir:

```bash
cd /opt/crossover
docker compose exec app npm run migrate
```

Yeni bot fallback maçları normal `Room` state machine'inden geçer; botlar sosyal
grafiklerde gerçek kullanıcı olarak yaratılmaz.

## Yedek / geri yükleme

```bash
docker exec crossover-db-1 pg_dump -U crossover -d crossover --no-owner \
  | gzip > backup-$(date +%F).sql.gz
# Sıfırlama: docker compose down && docker volume rm crossover_pgdata && up -d
# (DB yalnızca BOŞ volume'da seed'den dolar; volume varsa mevcut veri korunur.)
```

## Uygulama hangi adrese bağlanır — İKİ uç nokta

`app/src/config.ts` artık tek URL değil, **sıralı bir liste** tutar ve ilki
açılmazsa 6 sn içinde otomatik ikinciye devreder:

| Sıra | Adres | Not |
|---|---|---|
| 1 | `wss://api.crossoverfootball.com` | Birincil — gerçek alan adı (Hostinger DNS) |
| 2 | `wss://168-222-180-190.nip.io` | Yedek — aynı sunucu, wildcard DNS |

**Neden:** App Store 1.0 iki kez Guideline 2.1(a) ile reddedildi ("guest login →
hata mesajı") — oysa sunucu eriştiğimiz her ağdan sağlıklıydı. Tek uç nokta
`*.nip.io` idi; bu tür ücretsiz wildcard-DNS host'ları kurumsal DNS/proxy
filtrelerinde kategorik olarak engellenir ve **her giriş bu sokete bağlı**
olduğu için erişemeyen bir ağda uygulama tamamen kullanılamaz hâle gelir.

> Bu yüzden **iki Caddy bloğu da yaşamalı**: nip.io bloğunu silme, o artık yedek.

### api.crossoverfootball.com'u kurma (tek seferlik)

```bash
# 1. Hostinger DNS:  api  A  168.222.180.190  (TTL 300)
dig +short api.crossoverfootball.com        # → 168.222.180.190 görmeli

# 2. Caddy bloğu (mevcut blokları BOZMADAN ekle)
cp /root/transyol/Caddyfile /root/transyol/Caddyfile.bak-api
cat /opt/crossover/deploy/caddy-crossover-api.snippet >> /root/transyol/Caddyfile
docker exec transyol-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile

# 3. Doğrula (sertifikayı Caddy ilk istekte kendi alır)
curl https://api.crossoverfootball.com/health   # → {"ok":true,"rooms":0}
```

Yerel geliştirmede liste tek adresle ezilir:
`EXPO_PUBLIC_SERVER_URL=ws://localhost:8080 npx expo start`
