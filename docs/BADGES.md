# Rozet & Başarım Sistemi — Tasarım (v1)

> Araştırma temeli: Clash Royale profil rozetleri (Aralık 2018+ — kart ustalığı
> rozetleri, en nadir 8'ini öne çıkaran vitrin), Brawl Stars Mastery/Titles,
> Stack Overflow bronz/gümüş/altın hiyerarşisi, Steam başarımları.
> Profesyonel kalıplar: (1) AYNI davranış artan eşiklerle katmanlanır,
> (2) nadirlik rozetin GÖRSELİNDEN okunur (çerçeve malzemesi), (3) vitrine
> yalnız en iyi birkaçı çıkar, (4) kolay başlangıç + prestijli tepe.

## 1. Katman (güçlenme) sistemi — kullanıcının istediği çekirdek

Her rozet AYNI görevin artan eşikleriyle güçlenir; ikon sabit kalır,
**çerçevesi** malzeme atlar (mevcut avatar çerçeve dilimizle aynı aile):

| Katman | Çerçeve | Genel eşik kuralı |
|---|---|---|
| I | Bronz | 20 |
| II | Gümüş | 100 |
| III | Altın | 500 |
| IV | Elmas (ışıltılı) | 2000 |

Eşik ilerlemesi ~×5 (endüstri standardı 10→100→1000'e yakın ama ilk rozet
ilk günlerde gelsin diye 20 ile başlar). Hız gibi zor sayaçlarda eşikler
yarıya iner (10/50/250/1000).

## 2. Rozet kataloğu (v1 — 12 rozet)

Sayaç kaynağı: sunucu (finishRound / applyMatchResult). Hepsi hile-korumalı
şekilde SUNUCUDA sayılır; yalnız **sıralı (ranked) ve arkadaş maçları** sayılır,
bot antrenmanı SAYILMAZ (kasma istismarı).

| id | Ad (TR) | İkon | Sayaç | Eşikler |
|---|---|---|---|---|
| flash | Şimşek | ⚡ | ≤5 sn'de doğru cevap | 10/50/250/1000 |
| brain | Ansiklopedi | 🧠 | toplam doğru cevap | 20/100/500/2000 |
| pl | Premier Lig Alimi | 🦁 | İki takımı da Premier League turunda doğru | 20/100/500/2000 |
| superlig | Süper Lig Alimi | 🌙 | Süper Lig turunda doğru | 20/100/500/2000 |
| laliga | La Liga Alimi | ☀️ | La Liga turunda doğru | 20/100/500/2000 |
| seriea | Serie A Alimi | 🍕* | Serie A turunda doğru | 20/100/500/2000 |
| globetrotter | Gezgin | 🌍 | Ülke-Takım modunda doğru | 20/100/500/2000 |
| letters | Harf Cambazı | 🔤 | Harf-Takım modunda doğru | 20/100/500/2000 |
| scout | Yıldız Avcısı | 🔭 | Oyuncu-Oyuncu modunda doğru | 20/100/500/2000 |
| winner | Galip | 🏆 | maç galibiyeti | 10/50/250/1000 |
| streak | Seri | 🔥 | galibiyet serisi (kilometre taşı: en iyi seri) | 3/5/10/20 |
| legend | Efsane Bilgini | 👑 | efsane oyuncuyla doğru cevap | 10/50/200/500 |

*İkonlar placeholder — gerçek sanat: her rozet tek renk-ailesi SVG amblem +
katman çerçevesi (bronz/gümüş/altın/elmas). Lig rozetlerinde lig arması
KULLANILMAZ (4.1/5.2.1 IP riski) — soyut semboller.

Lig tespiti: `clubs.league` alanından (iki takım da o ligdeyse sayılır;
country-team modunda takım tarafı esas alınır). Efsane tespiti: legends id kümesi.

## 3. Nerede görünür

1. **Karşılaşma (VS) ekranı** — kullanıcının ana isteği: her oyuncunun adının
   altında **en iyi 3 rozeti** (en yüksek katman → en nadir öncelikli, CR'nin
   "spotlight" kuralı). Rakip daha maç başlamadan "bu adam Şimşek III" görür.
2. **Profil** — tam rozet ızgarası; her rozette katman çerçevesi + bir sonraki
   katmana ilerleme çubuğu (ör. 137/500). Kilitliler gri-silüet.
3. **Maç sonu** — katman atlanan an: "ROZET GÜÇLENDİ — Şimşek II" popup'ı
   (FrameUnlockCelebration dilinde parıltı + yeni çerçeve dökümü).
4. Arkadaş profili modalında da aynı vitrin üçlüsü.

## 4. Veri modeli (sunucu)

```sql
CREATE TABLE IF NOT EXISTS user_badges (
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL,
  progress INT  NOT NULL DEFAULT 0,
  tier     INT  NOT NULL DEFAULT 0,   -- 0=yok, 1..4; katman atlama tespiti için saklanır
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);
```

- `game/badges.ts`: bildirimsel katalog `{ id, thresholds[], event, filter }` +
  `award(userId, event, ctx)` motoru. Tek UPDATE ile progress++ ve yeni tier
  hesap; tier atladıysa dönüşte bildirir.
- Çağrı noktaları: `finishRound` (doğru cevap: kim, süre, mod, ligler,
  efsane mi) ve `applyMatchResult` (galibiyet, seri).
- `streak` kilometre-taşı tipi: progress = en iyi seri; tier eşiği geçince atlar.

## 5. Protokol

- `ProfileView.badges: { id, tier, progress }[]` (tam liste; profil çizer)
- `RoomView.players[].topBadges: { id, tier }[]` (≤3; VS ekranı çizer)
- Yeni ServerMsg: `badge_up { badgeId, tier }` (maç sonu popup tetiği)
- Geriye uyum: eski istemciler alanları görmez/yok sayar — kırılma yok,
  OTA ile gider (wrongopen'daki caps oyununa gerek yok; salt eklemeli).

## 6. İstemci

- `src/badges.tsx`: katalog aynası (ad/ikon/eşikler) + `BadgeArt` (SVG amblem
  + katman çerçevesi; çerçeve paleti frames.tsx bronz/gümüş/altın/elmas ile aynı)
- MatchupScreen: isim altı rozet sırası (32px, katman çerçeveli)
- ProfileScreen: "Rozetler" bölümü — ızgara + ilerleme çubukları
- Maç sonu: `badge_up` → LevelUpPopup dilinde kutlama
- i18n: rozet adları + betimleri (tr/en)

## 7. Rollout

1. Sunucu: tablo + motor + sayaç çağrıları + protokol → deploy (geriye uyumlu)
2. İstemci: sanat + üç yüzey + popup → OTA
3. Sayaçlar deploy gününden başlar (geçmiş maçlardan **backfill**: match_history
   rounds JSONB'sinden `winner`, `brain`, mod rozetleri kısmen geri doldurulabilir —
   v1.1'de; hız/lig verisi geçmişte yok).

## Kaynaklar
- Trophy — Designing Achievements for Optimal Engagement
- RoyaleAPI — New Achievement Badges on Player Profile (spotlight kuralı)
- Brawl Stars Wiki — Titles/Mastery; Stack Overflow rozet hiyerarşisi
