# Crossover — Teknik Plan

> Oyun adı: **Crossover**
> Durum: Uygulandı / evrimleşti. Bu dosya artık tarihsel mimari notudur; güncel çalışma şekli için README dosyalarına bakın.
> Tarih: 2026-05-31

---

## 1. Oyun Özeti

İki kişilik, gerçek zamanlı, oda-koduyla oynanan futbol bilgi & refleks oyunu.

**Tur akışı:**
1. Oyuncu A oda kurar → 6 haneli kod alır → Oyuncu B koda girer.
2. İkisinin de ekranında "Bir futbol takımı seç" alanı (otomatik tamamlamalı).
3. **3-2-1 geri sayım.**
4. A'nın seçtiği takım B'de, B'nin seçtiği takım A'da görünür → ekranda **2 takım** (ör. *Galatasaray + Inter*).
5. İkisine birden "Bu iki takımda da oynamış bir futbolcu yaz" alanı gelir.
6. **İlk doğru yazan kazanır.** İlk geçerli cevap sunucuya ulaştığı an diğer oyuncunun girişi kilitlenir.
7. Sonuç: Doğru → ✅ + futbolcunun her iki takımdaki dönemleri; Yanlış → ❌ + yazdığı futbolcunun gerçek takımları.
8. Skor güncellenir → "Tekrar oyna".

**En kritik teknik mesele:** "Bu futbolcu gerçekten bu iki takımda da oynadı mı?" sorusunu otomatik, adil ve sıfır maliyetle doğrulamak.

---

## 2. Teknoloji Yığını (kesinleşti)

| Katman | Seçim | Gerekçe |
|---|---|---|
| Mobil | **React Native + Expo** (custom dev client / EAS Build) | Tek kod → iOS + Android; native modüller için EAS şart |
| Oyun sunucusu | **Node.js + TypeScript**, Docker | WebSocket ekosistemi olgun; RN ile tip paylaşımı |
| Gerçek zamanlı | **WebSocket** (`ws`/Socket.io), sunucu içinde | İki oyuncu aynı sürece bağlanır; oda durumu bellekte, anında broadcast |
| Futbol verisi + fuzzy | **PostgreSQL** + `pg_trgm`/`unaccent` | Bulanık isim eşleştirme; Docker deploy'da izole Postgres |
| Oyun durumu | **Bellek içi Room state machine** | Tek Node sürecinde `answeredBy` kilidi → "ilk yazan kazanır" |
| Veri kaynağı | **Transfermarkt** → PostgreSQL | Güncel kodda ana veri kaynağı Transfermarkt ingest pipeline'ı; Wikidata scriptleri legacy |
| iOS sosyal | **Game Center (GameKit)** | Kimlik, lider tablosu, başarımlar, arkadaşlar |
| iOS canlı durum | **Live Activities + Dynamic Island (ActivityKit/WidgetKit)** | Kilit ekranı + Dynamic Island'da canlı maç durumu |
| Kimlik (sonra) | **Cognito** (anonim) + Game Center kimliği | Hızlı giriş |
| Altyapı | **Docker Compose** | Mevcut canlı deploy: Node app + izole Postgres, mevcut Caddy üzerinden TLS |

---

## 3. Mimari Genel Bakış

```
┌─────────────────┐                      ┌─────────────────┐
│  Oyuncu A (RN)  │                      │  Oyuncu B (RN)  │
│  + Game Center  │                      │  + Game Center  │
│  + LiveActivity │                      │  + LiveActivity │
└────────┬────────┘                      └────────┬────────┘
         │            WebSocket (wss://)          │
         └──────────────────┬─────────────────────┘
                            ▼
                ┌───────────────────────────┐
                │ Docker — Node.js sunucu     │
                │  WS gateway / oda yöneticisi│
                │  state machine / verify     │
                │  (+ APNs push → LiveActivity)│
                └───────┬───────────┬────────┘
                        ▼           ▼
              ┌──────────────┐  ┌──────────────────────┐
              │ Bellek içi oda│  │ Docker Postgres 16    │
              │ state machine │  │ players/clubs/        │
              │ first-wins    │  │ player_clubs + pg_trgm│
              └──────────────┘  └──────────────────────┘
```

**İlkeler:** Server-authoritative (hile/yarış korumalı); oda durumu bellekte, kalıcı kullanıcı/veri katmanı PostgreSQL'de; ölçekleme gerekirse çoklu app instance + Redis pub/sub (sonra).

---

## 4. Veri Katmanı — Transfermarkt Pipeline (oyunun kalbi)

### 4.1 Kaynak
- Ana kaynak: Transfermarkt API (`felipeall/transfermarkt-api`).
- Kapsam: lig/sezon bazlı kulüpler, kadrolar, oyuncu profilleri, transfer geçmişi, fotoğraf/logo/market değeri zenginleştirmeleri.
- Wikidata ingest scriptleri kodda legacy olarak duruyor; varsayılan rebuild hattı Transfermarkt'tır.

### 4.2 Çekim scriptleri
`server/src/ingest/tm-rebuild.ts` üç aşamalı ve kaldığı yerden devam edebilen hattı çalıştırır: kulüp/oyuncu keşfi, oyuncu kariyerleri, kulüp profilleri. Sonrasında `tm-swap`, `tm-marketvalue` ve `export-offline` ile canlı tablo ve mobil offline veri güncellenir.

### 4.3 PostgreSQL şeması
```sql
clubs(id bigint pk, name, name_norm, country, aliases text[]);
players(id bigint pk, name, name_norm, aliases text[], birth_year int, nationality);
player_clubs(player_id, club_id, start_year, end_year, primary key(player_id,club_id,start_year));
create extension if not exists pg_trgm; create extension if not exists unaccent;
create index on players using gin (name_norm gin_trgm_ops);
create index on clubs   using gin (name_norm gin_trgm_ops);
```

### 4.4 `verifyPlayer(teamAId, teamBId, guessText)`
normalize → `players` üzerinde fuzzy eşleştir (`similarity()` ~>0.6) → adayın `player_clubs`'ında hem A hem B var mı → `{correct, matchedPlayer, clubsA[], clubsB[], allClubs[]}`. Belirsizlikte "Bunu mu demek istedin?".

### 4.5 Açık kararlar (Faz 2'de kalibre)
Fuzzy eşik; Türkçe takım/takma ad sözlüğü; kiralık dönemler sayılır (varsayılan evet).

---

## 5. Oyun Durumu — Bellek İçi Oda & "ilk yazan kazanır"

```
Room         { code, status, players, round, timers }
Round        { picks, teamA, teamB, answeredBy, passedBy, finished }
Player       { id, name, score, wrongCount, transport, userId }
```
Atomik kazanan:
```
if (!round.answeredBy && status === 'guess') {
  round.answeredBy = playerId
  evaluateGuess()
}
```
`answeredBy` set edildikten sonra sonraki tahminler yok sayılır. Kazanan sonrası `verifyPlayer` → sonuç odaya broadcast.

---

## 6. Oyun Durum Makinesi
```
LOBBY ──▶ COUNTDOWN(3..1) ──▶ PICK_TEAM ──▶ REVEAL_TEAMS ──▶ GUESS ──▶ RESULT ──▶ (tekrar) COUNTDOWN
```
GUESS aşamasına süre limiti (öneri 30 sn).

---

## 7. WebSocket Protokolü (taslak)
İstemci→Sunucu: `create_room`, `join_room`, `start`, `pick_team`, `submit_guess`, `play_again`, `search_clubs`
Sunucu→İstemci: `room_update`, `countdown`, `reveal_teams`, `guess_locked`, `result`, `error`

---

## 8. iOS Native Özellikler (Game Center + Live Activities + Dynamic Island)

> Bunlar **iOS'a özel** ve **native kod** gerektirir. Expo Go ile çalışmaz → **EAS Build ile custom dev client** ve native modüller/widget extension şart. Android'de bu özellikler devre dışı kalır (graceful fallback).

### 8.1 Game Center (GameKit)
- **Kimlik doğrulama:** Açılışta `GKLocalPlayer` ile sessiz giriş; oyuncunun Game Center kimliği `gameCenterId` olarak sunucuya bağlanır.
- **Lider tablosu (Leaderboards):** Toplam galibiyet / en hızlı doğru cevap / kazanma serisi.
- **Başarımlar (Achievements):** "İlk galibiyet", "10 maç üst üste", "1 saniyede bildi" vb.
- **Arkadaşlar:** Game Center arkadaş listesinden oda daveti (ileride).
- RN tarafı: `expo-game-center` benzeri kütüphane ya da ince bir native Swift modülü (Expo config plugin).
- App Store Connect'te Game Center'ı etkinleştirme + leaderboard/achievement tanımları gerekir.

### 8.2 Live Activities + Dynamic Island (ActivityKit / WidgetKit)
- **Amaç:** Maç sürerken kilit ekranında ve **Dynamic Island**'da (kamera çevresindeki "ada", iPhone 14 Pro ve üzeri) canlı durum göstermek:
  - Geri sayım (3-2-1)
  - "Rakip takımı seçiyor…" / iki takım açıklandığında takım rozetleri
  - "Tahmin sırası!" + kalan süre
  - Sonuç: ✅/❌ + skor
- **Teknik:**
  - Swift ile bir **Widget Extension** (`ActivityKit` + `WidgetKit`) yazılır: compact / minimal / expanded Dynamic Island düzenleri + Lock Screen düzeni.
  - RN'den activity **başlat/güncelle/bitir**: `expo-live-activity` benzeri köprü veya özel native modül.
  - **Uzaktan güncelleme:** Uygulama arka plandayken sunucu, **APNs** üzerinden Live Activity push (`content-state`) gönderir → Node sunucusuna APNs entegrasyonu (token-based, `.p8` anahtarı) eklenir.
- **Gereksinimler:** iOS 16.1+ (Dynamic Island iPhone 14 Pro+); cihaz desteği yoksa otomatik gizlenir.

### 8.3 Expo/EAS etkisi
- `app.json`'a config plugin'ler; iOS deployment target 16.1+; Widget Extension target'ı; APNs sertifikası; `NSSupportsLiveActivities=YES`.
- Geliştirme **custom dev client** ile (Expo Go değil). CI için EAS Build.

---

## 9. Ekranlar (React Native)
Ana ekran → Lobi (oda kodu/paylaş) → Geri sayım → Takım seç (autocomplete) → Takımlar açıklandı → Tahmin (rakip yazınca kilit) → Sonuç (✅/❌ + geçmiş + skor) → Lider tablosu (Game Center).

---

## 10. Proje Klasör Yapısı
```
crossover/
├── PLAN.md
├── app/                     React Native (Expo, TS) — custom dev client
│   ├── src/{screens,components,net,game}
│   ├── modules/             native köprüler (game-center, live-activity)
│   └── ios/ (widget extension — Swift: ActivityKit/WidgetKit)
├── server/                  Node.js + TS: ws, rooms, game, db, ingest
├── website/                 Statik tanıtım sitesi
├── deploy/                  Docker/Caddy deploy notları
└── docker-compose.yml       App + izole Postgres
```

---

## 11. Yol Haritası
| Faz | İçerik | Çıktı |
|---|---|---|
| **2 (önce)** | Transfermarkt + PostgreSQL şema + `verifyPlayer` + fuzzy | "Galatasaray + Inter → Sneijder ✅" testi geçiyor |
| **1** | Expo (EAS dev client) + Node sunucu iskeleti + WS + paylaşılan tipler | Ekran geçişi + ping/pong |
| **0** | Docker Compose + Postgres + Caddy yönlendirme | Canlı sunucuda izole stack |
| **3** | Oda kur/katıl + WS senkron | İki cihaz aynı odada |
| **4** | Tam oyun akışı + atomik first-wins + sonuç | Uçtan uca maç |
| **5** | **Game Center** (kimlik, leaderboard, achievement) | iOS sosyal katman |
| **6** | **Live Activities + Dynamic Island** + APNs push | Kilit ekranı/ada canlı durum |
| **7** | Animasyon, ses, kopma/yeniden bağlanma, cila | Yayına yakın |

> iOS native özellikler (Faz 5-6) çekirdek oyun (Faz 1-4) çalıştıktan sonra eklenir; böylece Android+iOS ortak akış önce sağlamlaşır.

---

## 12. Maliyet
Transfermarkt API container'ı ve PostgreSQL yerel/Docker ortamında çalışır. Canlı deploy mevcut sunucuda Docker + izole Postgres + mevcut Caddy reverse proxy ile çalışacak şekilde notlandı. Yayın: Apple $99/yıl + Google $25.

---

## 13. Riskler & Açık Sorular
- Transfermarkt kapsamı; fuzzy eşik kalibrasyonu; Türkçe takım/takma ad sözlüğü.
- Aynı takım seçilirse kural (Faz 4).
- Tahmin süre limiti (öneri 30 sn).
- **Live Activity/Dynamic Island sadece iOS 16.1+ / belirli iPhone'larda** → Android & eski iOS için fallback.
- Game Center yerine kendi hesabımız mı? (öneri: iOS'ta Game Center, Android'de kendi/Google Play Games).
- Ölçekleme: çoklu app instance → Redis pub/sub (sonra).
```
