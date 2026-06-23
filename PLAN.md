# Crossover — Teknik Plan

> Oyun adı: **Crossover**
> ⚠️ **Bu planın üstünden kodlandı.** Mevcut uygulama bu planın bazı kısımlarından
> ayrışmıştır. Gerçek mimari için aşağıdaki güncel notlara ve kod tabanına bakın.
> Güncellenmeyen kısımlar (Live Activities, Game Center vb.) ileride eklenebilir.
>
> Durum: KODLANDI — çalışan prototip canlıda.
> Tarih: 2026-05-31 (plan); son güncelleme: 2026-06-23

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

## 2. Teknoloji Yığını (güncel — 2026-06)

| Katman | Seçim | Not |
|---|---|---|
| Mobil | **React Native + Expo (SDK 56)** | iOS + Android; şu an Expo Go'da çalışıyor |
| Oyun sunucusu | **Node.js + TypeScript**, Linux VPS (Docker) | 168.222.180.190 üzerinde çalışıyor |
| Gerçek zamanlı | **WebSocket** (`ws`), sunucu içinde oda yöneticisi | Oda durumu bellekte, anında broadcast |
| Veritabanı | **PostgreSQL 16** + `pg_trgm`/`unaccent` | Tek DB: kullanıcı, kulüp, oyuncu, mesaj, satın alma |
| Oyun durumu | **PostgreSQL** (tek sorguda first-wins kilidi) | Dinamik tablo yok; oda geçici, round'lar sunucuda doğrulanır |
| Veri kaynağı | **Transfermarkt** (felipeall/transfermarkt-api) → Postgres | 36 lig, 2006-2025 sezonları |
| Kimlik | **Apple Sign In / Google Sign In / Guest** | Doğrudan sunucuda token doğrulama; ayrı auth servisi yok |
| iOS sosyal | — | Game Center henüz eklenmedi |
| iOS canlı durum | — | Live Activities henüz eklenmedi |
| iOS ödeme | **StoreKit** (uygulama içi satın alma) | Apple IAP ile elmas + Sosyal Paket |
| Altyapı | **Docker Compose** (VPS: Caddy + Node + Postgres) | AWS CDK kullanılmıyor; manuel setup |

---

## 3. Mimari Genel Bakış (güncel)

```
┌─────────────────┐                      ┌─────────────────┐
│  Oyuncu A (RN)  │                      │  Oyuncu B (RN)  │
│  (Expo / iOS)   │                      │  (Expo / iOS)   │
└────────┬────────┘                      └────────┬────────┘
         │            WebSocket (wss://)          │
         └──────────────────┬─────────────────────┘
                            ▼
                ┌──────────────────────────────────┐
                │   Docker — Node.js sunucu         │
                │  WS gateway / oda yöneticisi      │
                │  state machine / verifyPlayer     │
                │  arkadaşlık / mesajlaşma / IAP    │
                └──────────────┬───────────────────┘
                               ▼
                ┌──────────────────────────────────┐
                │   PostgreSQL 16                   │
                │  users, clubs, players,           │
                │  player_clubs, messages,          │
                │  purchases, emotes, avatars       │
                │  + pg_trgm (fuzzy eşleştirme)     │
                └──────────────────────────────────┘
```

**İlkeler:** Server-authoritative (hile/yarış korumalı); oda durumu bellekte + Postgres'te kalıcılık (kullanıcı, satın alma, mesaj).

---

## 4. Veri Katmanı — Transfermarkt Pipeline (oyunun kalbi)

### 4.1 Kaynak
- **Transfermarkt** (`felipeall/transfermarkt-api`): 36 lig, 2006-2025 sezonları.
- Erişim: Docker üzerinde `felipeall/transfermarkt-api` imajı (`:8000`).

### 4.2 Çekim scripti (`server/src/tm-rebuild.ts`)
3 aşamalı, devam ettirilebilir (resumable) pipeline:
1. **Phase A (discover):** Her lig x sezon için kadroları tara → tüm kulüp & oyuncu ID'lerini topla
2. **Phase C (careers):** Her oyuncu için profil (isim, fotoğraf, doğum yılı, milliyet) + transfer geçmişi → kariyer dönemleri
3. **Phase B (club profiles):** Logo, ülke, lig bilgisi
Veri staging tablolara (`tm_clubs`, `tm_players`, `tm_player_clubs`) yazılır; `npm run ingest:swap` ile atomik değişim.

### 4.3 Postgres şeması
```sql
clubs(id int pk, name text, name_norm text, country text, logo text, market_value bigint);
players(id int pk, name text, name_norm text, photo text, birth_year int, nationality text);
player_clubs(player_id int, club_id int, season text, start_date text, end_date text);
create extension if not exists pg_trgm; create extension if not exists unaccent;
create index on players using gin (name_norm gin_trgm_ops);
create index on clubs   using gin (name_norm gin_trgm_ops);
```
Kullanıcı, satın alma, mesaj tabloları (`schema.sql`) da aynı DB'de.

### 4.4 `verifyPlayer(teamA, teamB, guessText)`
normalize → `players` üzerinde fuzzy eşleştir (`word_similarity` eşik ~0.3) → adayın `player_clubs`'ında hem A hem B var mı → sonuç. Popülerlik sıralaması için market value kullanılır.

---

## 5. Oyun Durumu — "ilk yazan kazanır" (Sunucu içi)

Oda durumu **bellekte** tutulur (`RoomManager`, `server/src/rooms/`). Round sonuçları `verifyPlayer` ile doğrulanır, kazananın kilidi sunucu tarafında `submit_guess` mesajının sırasıyla: ilk gelen geçerli cevap round'u kilitler. Kalıcılık gereken veriler (kullanıcı profili, satın alma, mesaj) Postgres'e yazılır. Oda geçicidir — tur/maç verisi sadece runtime'da bulunur.

---

## 6. Oyun Durum Makinesi
```
LOBBY ──▶ COUNTDOWN(3..1) ──▶ PICK_TEAM ──▶ REVEAL_TEAMS ──▶ GUESS ──▶ RESULT ──▶ (tekrar) COUNTDOWN
```
GUESS aşamasına süre limiti (öneri 30 sn).

---

## 7. WebSocket Protokolü (güncel)

Tam protokol tipleri `app/src/protocol.ts` ve `server/src/protocol.ts`'de. Kısmi liste:

İstemci→Sunucu: `register`, `auth`, `guest`, `change_name`, `set_username`, `find_match`, `create_room`, `create_solo`, `join_room`, `start`, `pick_team`, `submit_guess`, `play_again`, `buy_emote`, `equip_emotes`, `set_avatar`, `buy_avatar`, `verify_purchase`, `grant_ad_reward`, `send_message`, `list_messages`, `list_conversations`, `mark_read`, `send_friend_request`, `respond_friend_request`, `remove_friend`, `invite_friend_match`, `search_users`

Sunucu→İstemci: `profile`, `name_changed`, `room_update`, `countdown`, `reveal_teams`, `guess_locked`, `result`, `error`, `message_received`, `friend_request_sent`, `friends_list`, `conversation_list`, `match_history_list`, `diamonds_granted`

---

## 8. iOS Native Özellikler (Game Center + Live Activities + Dynamic Island) — PLANLANAN

> ⚠️ Henüz uygulanmadı. Aşağıdakiler ileride eklenmek üzere not alınmıştır.
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

## 9. Ekranlar (React Native — güncel)
Ana ekran → Lobi (oda kodu/paylaş) → Geri sayım → Takım seç (autocomplete) → Takımlar açıklandı → Tahmin → Sonuç (✅/❌ + kariyer + skor) → Tekrar oyna.

Ayrıca: Mağaza, Koleksiyon, Arkadaşlar, Profil, Ayarlar, Sohbet, Lider Tablosu, Arenalar, Eğitim. Hepsi `app/src/screens.tsx` içinde phase-based router ile yönetilir.

---

## 10. Proje Klasör Yapısı (güncel)
```
crossover/
├── PLAN.md
├── app/                     React Native (Expo 56, TS)
│   ├── src/
│   │   ├── screens.tsx      Tüm ekranlar (phase router)
│   │   ├── useCrossover.ts  WebSocket bağlantısı + state yönetimi
│   │   ├── i18n.ts          Dil altyapısı
│   │   ├── i18n-locales/    19 dil dosyası
│   │   ├── protocol.ts      Sunucuyla paylaşılan protokol tipleri
│   │   ├── config.ts        Sunucu adresi (platform bazlı)
│   │   └── offline/         Bot modu için offline veritabanı
│   └── app.json
├── server/                  Node.js + TS (Docker): ws, rooms, game, db
│   ├── src/
│   │   ├── ws/server.ts     WebSocket girişi + mesaj yönlendirme
│   │   ├── game/            verify, rank, auth, iap, username
│   │   ├── rooms/           Oda yöneticisi, state machine, bot
│   │   ├── db/              Şema, pool, transfermarkt ingest
│   │   └── protocol.ts      App ile paylaşılan tipler
│   └── tm-rebuild.ts        Transfermarkt ingest pipeline
├── deploy/                  Docker Compose + dağıtım notları
└── website/                 Tanıtım sayfası (vanilla HTML/CSS/JS)
```

---

## 11. Durum (2026-06)
| Alan | Durum | Detay |
|---|---|---|
| Oyun akışı (create/join/solo/bot) | ✅ Tamam | Tüm modlar çalışıyor |
| verifyPlayer (Transfermarkt) | ✅ Tamam | 36 lig, fuzzy eşik 0.3 |
| Kullanıcı hesabı (Apple/Google/Guest) | ✅ Tamam | Token doğrulama + kayıt |
| Mağaza & IAP | ✅ Tamam | Elmas, emote, avatar, Sosyal Paket |
| Arkadaşlık sistemi | ✅ Tamam | Ekle/çıkar/kabul/davet |
| Sohbet (DM) | ✅ Tamam | WebSocket üzerinden mesajlaşma |
| Lider tablosu | ✅ Tamam | HTTP endpoint |
| Çoklu dil (19 dil) | ✅ Tamam | Tüm kullanıcı arayüzü metinleri |
| Profil & Ayarlar | ✅ Tamam | Avatar, isim değiştirme, dil, çıkış |
| Eğitim (tutorial) | ✅ Tamam | 3 adımlı interaktif eğitim |
| **Game Center** | ❌ Planlandı | iOS sosyal katman |
| **Live Activities** | ❌ Planlandı | Dynamic Island / kilit ekranı |
| **Android** | ⏳ Kısmi | Expo ile çalışır; native özellikler iOS sonrası |

---

## 12. Maliyet (güncel)
Transfermarkt API (Docker) ücretsiz. VPS: ~$10/ay (Postgres + Node). Apple Developer: $99/yıl. Google Play: $25 tek seferlik. APNs ücretsiz. Geliştirmede ~0.

---

## 13. Riskler & Açık Sorular
- Transfermarkt API oran limiti/kullanılabilirlik; yedek veri kaynağı gerekebilir.
- Fuzzy eşik kalibrasyonu (şu an 0.3); yanlış pozitif/negatif oranı.
- Ölçekleme: çoklu Node → Redis pub/sub gerekebilir.
- AuthKey.p8 dosyası repo içinde — güvenlik riski, gitignore'a eklenmeli.
```

