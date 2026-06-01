# Crossover — Teknik Plan

> Oyun adı: **Crossover**
> Durum: PLAN — onay bekliyor. Henüz uygulama kodu yazılmadı.
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
| Oyun sunucusu | **Node.js + TypeScript**, **AWS EC2** | WebSocket ekosistemi olgun; RN ile tip paylaşımı |
| Gerçek zamanlı | **WebSocket** (`ws`/Socket.io), sunucu içinde | İki oyuncu aynı sürece bağlanır; oda durumu bellekte, anında broadcast |
| Futbol verisi + fuzzy | **Aurora Serverless v2 (PostgreSQL)** + `pg_trgm`/`unaccent` | Bulanık isim eşleştirme; boştayken ~0 maliyet |
| Oyun durumu | **DynamoDB** | Atomik conditional write → "ilk yazan kazanır" |
| Veri kaynağı | **Wikidata** → Aurora | Sıfır maliyetle en geniş kapsam |
| iOS sosyal | **Game Center (GameKit)** | Kimlik, lider tablosu, başarımlar, arkadaşlar |
| iOS canlı durum | **Live Activities + Dynamic Island (ActivityKit/WidgetKit)** | Kilit ekranı + Dynamic Island'da canlı maç durumu |
| Kimlik (sonra) | **Cognito** (anonim) + Game Center kimliği | Hızlı giriş |
| Altyapı (IaC) | **AWS CDK** (TypeScript) | EC2 + Aurora + DynamoDB tek dilde |

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
                │   EC2 — Node.js sunucu     │
                │  WS gateway / oda yöneticisi│
                │  state machine / verify     │
                │  (+ APNs push → LiveActivity)│
                └───────┬───────────┬────────┘
                        ▼           ▼
              ┌──────────────┐  ┌──────────────────────┐
              │  DynamoDB    │  │ Aurora Serverless v2  │
              │  oyun durumu │  │  (PostgreSQL)         │
              │  atomik      │  │  players/clubs/       │
              │  first-wins  │  │  player_clubs + pg_trgm│
              └──────────────┘  └──────────────────────┘
```

**İlkeler:** Server-authoritative (hile/yarış korumalı); oda durumu bellekte + DynamoDB kalıcılık; ölçekleme gerekirse çoklu EC2 + Redis pub/sub (sonra).

---

## 4. Veri Katmanı — Wikidata Pipeline (oyunun kalbi)

### 4.1 Kaynak
- Wikidata `P54 (member of sports team)`: oyuncu → kulüpler + dönemler (`P580`/`P582`); `P641=Q2736` (futbol) filtresi.
- Erişim: **SPARQL endpoint** (sayfalı) veya JSON dump.

### 4.2 Çekim scripti (`scripts/ingest-wikidata.ts`)
Sayfalı çek → normalize (aksan/küçük harf) → Aurora `upsert`. Aylık cron (EventBridge/Lambda veya EC2 cron) ile tazele. (Wikidata alt lig/eski oyuncuda eksik olabilir ama ücretsizler içinde en dolu.)

### 4.3 Aurora şeması
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

## 5. Oyun Durumu — DynamoDB & "ilk yazan kazanır"

```
Rooms        PK=roomCode             { status, hostId, createdAt, ttl }
RoomPlayers  PK=roomCode SK=playerId { displayName, score, connected, gameCenterId }
Rounds       PK=roomCode SK=roundNo  { teamA, teamB, state, winnerId, winningGuess, isCorrect }
```
Atomik kazanan:
```
UpdateItem Rounds SET winnerId=:pid, winningGuess=:g, answeredAt=:now
  ConditionExpression: attribute_not_exists(winnerId)
```
Koşul başarısız → oyuncu geç kaldı, kilit. Kazanan sonrası `verifyPlayer` → sonuç odaya broadcast.

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
  - **Uzaktan güncelleme:** Uygulama arka plandayken sunucu, **APNs** üzerinden Live Activity push (`content-state`) gönderir → EC2 sunucusuna APNs entegrasyonu (token-based, `.p8` anahtarı) eklenir.
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
├── server/                  Node.js + TS (EC2): ws, rooms, game, db, apns
├── shared/                  app & server ortak tipler/protokol
├── scripts/ingest-wikidata.ts
└── infra/                   AWS CDK (EC2, Aurora v2, DynamoDB, VPC, SG)
```

---

## 11. Yol Haritası
| Faz | İçerik | Çıktı |
|---|---|---|
| **2 (önce)** | Wikidata + Aurora şema + `verifyPlayer` + fuzzy | "Galatasaray + Inter → Sneijder ✅" testi geçiyor |
| **1** | Expo (EAS dev client) + Node sunucu iskeleti + WS + paylaşılan tipler | Ekran geçişi + ping/pong |
| **0** | AWS CDK: VPC, EC2, Aurora v2, DynamoDB | Bulutta bağlı altyapı |
| **3** | Oda kur/katıl + WS senkron + DynamoDB | İki cihaz aynı odada |
| **4** | Tam oyun akışı + atomik first-wins + sonuç | Uçtan uca maç |
| **5** | **Game Center** (kimlik, leaderboard, achievement) | iOS sosyal katman |
| **6** | **Live Activities + Dynamic Island** + APNs push | Kilit ekranı/ada canlı durum |
| **7** | Animasyon, ses, kopma/yeniden bağlanma, cila | Yayına yakın |

> iOS native özellikler (Faz 5-6) çekirdek oyun (Faz 1-4) çalıştıktan sonra eklenir; böylece Android+iOS ortak akış önce sağlamlaşır.

---

## 12. Maliyet
Wikidata ücretsiz. EC2 t3.micro + DynamoDB free tier; Aurora v2 boşta ~0. APNs ücretsiz (Apple Developer hesabı içinde). Yayın: Apple $99/yıl + Google $25. Geliştirmede ~0.

---

## 13. Riskler & Açık Sorular
- Wikidata kapsamı; fuzzy eşik kalibrasyonu; Türkçe takım/takma ad sözlüğü.
- Aynı takım seçilirse kural (Faz 4).
- Tahmin süre limiti (öneri 30 sn).
- **Live Activity/Dynamic Island sadece iOS 16.1+ / belirli iPhone'larda** → Android & eski iOS için fallback.
- Game Center yerine kendi hesabımız mı? (öneri: iOS'ta Game Center, Android'de kendi/Google Play Games).
- Ölçekleme: çoklu EC2 → Redis pub/sub (sonra).
```

