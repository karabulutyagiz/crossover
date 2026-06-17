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
docker compose up -d --build app     # kod güncellemesi (DB volume'a dokunmaz)
```

## Yedek / geri yükleme

```bash
docker exec crossover-db-1 pg_dump -U crossover -d crossover --no-owner \
  | gzip > backup-$(date +%F).sql.gz
# Sıfırlama: docker compose down && docker volume rm crossover_pgdata && up -d
# (DB yalnızca BOŞ volume'da seed'den dolar; volume varsa mevcut veri korunur.)
```

## ⚠️ Kalan tek iş — mobil uygulamayı yeniden derle

App hâlâ eski AWS adresine (`wss://15-237-97-221.nip.io`) derlenmiş. Yeni adrese
geçmek için `app/` içinde:

```bash
EXPO_PUBLIC_SERVER_URL=wss://168-222-180-190.nip.io \
  eas build --platform ios --profile production
```

Yeni build TestFlight'a çıkana kadar eski istemciler eski (askıya alınmış)
sunucuya bakmaya devam eder.
