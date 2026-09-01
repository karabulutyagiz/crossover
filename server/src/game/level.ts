// ---- Seviye sistemi ----
// Kupadan bağımsız, ASLA düşmeyen sadakat merdiveni. XP yalnız maç sonunda,
// SUNUCU tarafında yazılır (istemciye güvenilmez). Kurallar:
//   * Gerçek maç: galibiyet 40 XP, mağlubiyet 15 XP
//   * Günün ilk GERÇEK galibiyeti: +50 XP bonus
//   * Bot maçı: galibiyet 15 / mağlubiyet 5, günlük tavan 60 XP (farm koruması)
//   * Seviye eşiği: 100 + (seviye-1) × 25 XP, tavan 50
// Ödüller TOPLAMALIDIR (Clash Royale pass modeli): seviyeye ulaşmak ödülü
// yalnız HAZIR yapar; oyuncu Seviye Yolu'nda karta dokunup toplar
// (claim_level_reward). Toplanan seviyeler users.claimed_levels'ta tutulur.
// Ödül YALNIZ 5'in katlarında vardır (ara seviyeler boş ilerleme adımıdır):
//   * 5/15/25/35/45: güç + 50 elmas
//   * 10/20/30/40/50: kademe çerçevesi + 100 elmas (takmak için toplanmış olmalı)
// İfadeler Yol'dan KAZANILMAZ — yalnız mağazadan satın alınır (emotes.ts).
import { pool } from '../db/pool.ts';
import { recordDiamondLedger } from './diamondLedger.ts';
import type { SpecialPowerId } from './specialPowers.ts';

export const LEVEL_CAP = 50;

// ---- Hesap seviyesi (2026-09-02) -------------------------------------------
// Sezonluk xp/level her devirde sıfırlanır; oyuncular "43'tüm, 1 oldum" diye
// haklı şikâyet etti. total_xp ASLA sıfırlanmaz ve LoL usulü ömürlük hesap
// seviyesini üretir. Aynı XP eğrisi kullanılır ama TAVAN YOK — 50'den sonra
// her seviye 280 XP ister ve sonsuza kadar tırmanır.
/** Bir seviyeye ULAŞMAK için gereken kümülatif XP (xpForNext(1..L-1) toplamı). */
export function cumXpToLevel(level: number): number {
  let toplam = 0;
  for (let i = 1; i < level; i++) toplam += xpForNext(i);
  return toplam;
}

/** total_xp → { level, into (seviye içi ilerleme), next (seviye eşiği) }. Tavansız. */
export function accountLevelFromTotal(totalXp: number): { level: number; into: number; next: number } {
  let level = 1;
  let kalan = Math.max(0, totalXp);
  while (kalan >= xpForNext(level)) {
    kalan -= xpForNext(level);
    level += 1;
    if (level > 5000) break; // teorik emniyet — eğri gereği ulaşılamaz
  }
  return { level, into: kalan, next: xpForNext(level) };
}

// Kademeli bantlar (Brawl Stars pass modeli) — AYLIK sezona ayarlı:
// toplam 9.460 XP (eski 34.300'dü). İlk seviye tek galibiyetle patlar (40;
// günün ilk galibiyeti 90 XP = L1 + L2'nin çoğu), düzenli oyuncu (~11 gerçek
// maç/gün, %55 galibiyet ≈ 360 XP/gün) 50'yi ~26. günde bitirir, günübirlik
// (4-5 maç) ay sonunda ~28-36 bandına gelir. Kaynaklı tasarım: workflow
// wf_0fe4e95b — Valorant/Fortnite/Brawl Stars/CR pass eğrileri.
export function xpForNext(level: number): number {
  if (level <= 1) return 40;
  if (level === 2) return 60;
  if (level <= 5) return 80;
  if (level <= 10) return 120;
  if (level <= 20) return 160;
  if (level <= 30) return 200;
  if (level <= 40) return 240;
  return 280; // 41+ (tavan dahil — UI'da 0'a bölme olmasın)
}

// Özel güçler — Seviye Yolu'ndan kazanılan TEK KULLANIMLIK, stoklanabilir
// tüketilebilirler (elmasla SATILMAZ). Çerçeve olmayan ×5 seviyelerinde
// dönüşümlü dağıtılır.
//   xp2x  : 1 saat boyunca kazanılan tüm XP ikiye katlanır
//   shield: kuşanılır; sıradaki dereceli maçta tüketilir, mağlubiyette kupa kaybını emer
//   streak: son mağlubiyette kırılan galibiyet serisini geri yükler (anında)
//   training: 1 saat boyunca bot maçlarındaki günlük 60 XP tavanı kalkar
//   socialtoken: Sosyal Paket süresine +24 saat ekler (yoksa şimdiden başlar, varsa üstüne eklenir)
export type PowerId = 'xp2x' | 'shield' | 'streak' | 'training' | 'socialtoken';
export const LEVEL_POWERS: Record<number, PowerId> = {
  5: 'xp2x',
  15: 'shield',
  25: 'streak',
  35: 'training',
  45: 'socialtoken',
};

// ---- PREMIUM Seviye Yolu ----
// PREMIUM_ROAD_PRICE (2000) elmasla sezonda bir kez açılır (users.premium_road).
// Ücretsiz yolun YANINDA
// akan ikinci şerit: HER ×5 seviyesinde bir güç + daha dolgun elmas (×5: 200,
// ×10: 300, zirve 50: 400 → toplam 2600💎 + 10 güç). Dağıtım İKİ kurala göre
// tasarlandı: (1) her güç premium şeritte TAM 2 kez çıkar — hiçbiri diğerinden
// şanslı değil; (2) ücretsiz şeritle ORTAK seviyelerde (5/15/25/35/45) premium
// ödülü ÜCRETSİZ ödülüyle ASLA aynı değildir — aynı satırda iki kart aynı
// gücü göstermez.
export const PREMIUM_ROAD_PRICE = 2000;
export const PREMIUM_LEVEL_POWERS: Record<number, PowerId> = {
  5: 'shield', 10: 'streak', 15: 'xp2x', 20: 'socialtoken', 25: 'training',
  30: 'shield', 35: 'socialtoken', 40: 'xp2x', 45: 'streak', 50: 'training',
};

export function premiumRewardDiamonds(level: number): number {
  if (level % 5 !== 0) return 0;
  if (level === LEVEL_CAP) return 400;
  return level % 10 === 0 ? 300 : 200;
}


// ══════════════════════════════════════════════════════════════════════════
// CO-PASS SEZON 2 (2026-08-30) — 50 seviyenin HER BİRİNDE ödül
// ══════════════════════════════════════════════════════════════════════════
// Eski yol yalnız 5'in katlarında ödül taşıyordu (10 nokta); aradaki 40 seviye
// boş ilerleme adımıydı. Yeni sezonda 50 ücretsiz + 50 premium = 100 ödül
// slotu var, yani her seviye atlayışı bir şey veriyor.
//
// DEĞİŞMEZ KURAL — YENİ ASSET ÜRETİLMEDİ: ödüller yalnız oyunda HALİHAZIRDA
// çizili olan içeriklerden seçildi. Kozmetikler cosmetics.ts'teki
// SELLABLE_COSMETICS beyaz listesinden gelir (katalogdaki diğer ürünlerin
// görseli yok, satış yüzeyine de çıkmıyorlar). Mythic'ler (goat_*) bilerek
// DIŞARIDA: kalıcı kural gereği yalnız KASA'da satılırlar.
//
// EKONOMİ: ücretsiz 1.050💎, premium 3.075💎 (fiyatı 2.000💎). Premium net
// +1.075💎 + 17 maç gücü + 4 kozmetik ile belirgin değerli, ama verilen her güç
// TÜKETİLEBİLİR — kalıcı rekabet avantajı satılmıyor.
//
// Bayrak arkasında: COPASS_V2_ENABLED=1 olmadan eski (5'in katları) yol
// yürürlükte kalır. Sezon dönene kadar canlıda hiçbir şey değişmez.
export function copassV2Enabled(): boolean {
  return process.env.COPASS_V2_ENABLED === '1';
}

export interface PassReward {
  diamonds?: number;
  roadPower?: PowerId;              // stoklanabilir meta güç (power_* sütunları)
  specialPower?: SpecialPowerId;    // maç içi güç (sp_* sütunları)
  frameTier?: string;               // kalıcı çerçeve (owned_frames)
  cosmeticId?: string;              // SELLABLE_COSMETICS üyesi (owned_cosmetics)
}

/** Sahip olunan kozmetik tekrar düşerse bunun yerine elmas verilir. */
export const COSMETIC_DUPLICATE_DIAMONDS = 150;

const D = (diamonds: number): PassReward => ({ diamonds });
const RP = (roadPower: PowerId): PassReward => ({ roadPower });
const SP = (specialPower: SpecialPowerId): PassReward => ({ specialPower });

// ÇERÇEVE YOK (kullanıcı kararı 2026-09-01: "çerçeve vermicez demiştik"):
// eski yolun ×10 seviyelerinde bronze/silver/gold/diamond/goat çerçeveleri
// vardı. Yeni sezonda çerçeve prestiji SEZON ÖDÜLÜNE ait (S1 çerçevesi, 1000+
// kupa) — pass'ten de dağıtmak o ödülün değerini düşürürdü. Kilometre taşları
// boş kalmasın diye yerlerine maç içi güçlerin pahalı olanları kondu.
export const PASS_V2_FREE: Record<number, PassReward> = {
  1: D(15),  2: SP('extratime'),     3: D(15),  4: SP('secondchance'),
  5: { roadPower: 'xp2x', diamonds: 50 },
  6: { diamonds: 15, specialPower: 'freeze' },  7: SP('extratime'),     8: D(15),  9: RP('xp2x'),
  10: { specialPower: 'freeze', diamonds: 100 },
  11: D(15), 12: SP('secondchance'), 13: D(15), 14: SP('extratime'),
  15: { roadPower: 'shield', diamonds: 50 },
  16: { diamonds: 15, specialPower: 'secondchance' }, 17: SP('skip'),         18: D(15), 19: RP('shield'),
  20: { specialPower: 'skip', diamonds: 100 },
  21: D(15), 22: SP('secondchance'), 23: D(15), 24: SP('extratime'),
  25: { roadPower: 'streak', diamonds: 50 },
  26: { diamonds: 15, specialPower: 'freeze' }, 27: RP('streak'),       28: D(15), 29: SP('secondchance'),
  30: { specialPower: 'reveal', diamonds: 100 },
  31: D(15), 32: SP('extratime'),    33: D(15), 34: RP('training'),
  35: { roadPower: 'training', diamonds: 50 },
  36: { diamonds: 15, specialPower: 'extratime' }, 37: SP('skip'),         38: D(15), 39: RP('socialtoken'),
  40: { specialPower: 'freeze', diamonds: 100 },
  41: D(15), 42: SP('freeze'),       43: D(15), 44: { cosmeticId: 'ice_name' },
  45: { roadPower: 'socialtoken', diamonds: 50 },
  46: { diamonds: 15, specialPower: 'skip' }, 47: SP('extratime'),    48: D(15), 49: RP('xp2x'),
  50: { frameTier: 'goat', specialPower: 'reveal', diamonds: 150 }, // zirve: GOAT çerçevesi
};

export const PASS_V2_PREMIUM: Record<number, PassReward> = {
  1: D(25),  2: SP('freeze'),        3: D(25),  4: SP('skip'),
  5: { roadPower: 'shield', diamonds: 200 },
  6: { diamonds: 25, specialPower: 'skip' },  7: SP('reveal'),        8: D(25),  9: SP('freeze'),
  10: { roadPower: 'streak', diamonds: 300 },
  11: D(25), 12: SP('skip'),         13: D(25), 14: { cosmeticId: 'ice_name' },
  15: { roadPower: 'xp2x', diamonds: 200 },
  16: D(25), 17: SP('freeze'),       18: D(25), 19: SP('reveal'),
  20: { roadPower: 'socialtoken', diamonds: 300 },
  21: { diamonds: 25, specialPower: 'freeze' }, 22: SP('skip'),         23: D(25), 24: SP('secondchance'),
  25: { roadPower: 'training', diamonds: 200 },
  26: D(25), 27: { cosmeticId: 'night_stadium' }, 28: D(25), 29: SP('freeze'),
  30: { roadPower: 'shield', diamonds: 300 },
  31: D(25), 32: SP('reveal'),       33: D(25), 34: SP('skip'),
  35: { roadPower: 'socialtoken', diamonds: 200 },
  36: D(25), 37: SP('freeze'),       38: { cosmeticId: 'lightning_victory' }, 39: SP('extratime'),
  40: { roadPower: 'xp2x', diamonds: 300 },
  41: { diamonds: 25, specialPower: 'reveal' }, 42: SP('reveal'),       43: D(25), 44: SP('secondchance'),
  45: { roadPower: 'streak', diamonds: 200 },
  46: D(25), 47: SP('freeze'),       48: RP('xp2x'),  49: D(25),
  50: { cosmeticId: 'champions_ball', roadPower: 'training', diamonds: 400 },
};

/** Bir seviyenin ödülü (v2 açıkken). Tanımsızsa o seviyede ödül yoktur. */
export function passReward(level: number, track: 'free' | 'premium'): PassReward | null {
  const table = track === 'premium' ? PASS_V2_PREMIUM : PASS_V2_FREE;
  return table[level] ?? null;
}

export interface LevelUpReward {
  level: number;
  diamonds: number;
  emoteId?: string;
  powerId?: PowerId; // bu seviyenin Yol ödülü bir güçse (toplamak claim ile)
}

export interface XpAward {
  xp: number;          // mevcut seviye İÇİNDEKİ ilerleme
  level: number;
  xpForNext: number;   // bu seviyeyi bitirmek için gereken toplam
  gained: number;      // bu maçtan kazanılan XP
  leveledUp: LevelUpReward[];
  diamonds?: number;   // ödüller sonrası güncel bakiye (değiştiyse)
  boosted?: boolean;   // 2x XP jetonu penceresi aktifken kazanıldı
}

interface LevelRow {
  xp: number;
  level: number;
  last_win_day: string | null;
  bot_xp_day: string | null;
  bot_xp_today: number | null;
  diamonds: number;
  owned_emotes: string[] | null;
  xp_boost_until: string | null;
  training_boost_until: string | null;
}

/**
 * Ham XP'yi hesaba işler: seviye atlama döngüsü + tavan kuralı tek yerde.
 * Maç XP'si (awardMatchXp) ve Günlük Görev ödülü aynı yoldan geçsin diye
 * ayrıldı — iki kopya, iki farklı seviye mantığı demek olurdu.
 * Maça özgü sayaçlar (bot tavanı, günün ilk galibiyeti) çağırana aittir.
 */
export async function applyRawXp(userId: string, rawXp: number): Promise<XpAward | null> {
  if (!userId || rawXp <= 0) return null;
  const { rows } = await pool.query<{ xp: number; level: number }>(
    `SELECT xp, level FROM users WHERE id = $1`, [userId],
  );
  const u = rows[0];
  if (!u) return null;
  if ((u.level ?? 1) >= LEVEL_CAP) return null; // zirvede XP yazılmaz
  let level = u.level ?? 1;
  let xp = (u.xp ?? 0) + rawXp;
  const leveledUp: LevelUpReward[] = [];
  while (level < LEVEL_CAP && xp >= xpForNext(level)) {
    xp -= xpForNext(level);
    level += 1;
    leveledUp.push({ level, diamonds: levelRewardDiamonds(level), powerId: LEVEL_POWERS[level] });
  }
  if (level >= LEVEL_CAP) xp = Math.min(xp, xpForNext(LEVEL_CAP));
  await pool.query(`UPDATE users SET xp = $2, level = $3, total_xp = total_xp + $4 WHERE id = $1`, [userId, xp, level, rawXp]);
  return { xp, level, xpForNext: xpForNext(level), gained: rawXp, leveledUp };
}

export async function awardMatchXp(userId: string, won: boolean, vsBot: boolean): Promise<XpAward | null> {
  if (!userId) return null;
  const { rows } = await pool.query<LevelRow>(
    `SELECT xp, level, last_win_day, bot_xp_day, bot_xp_today, diamonds, owned_emotes, xp_boost_until, training_boost_until
     FROM users WHERE id = $1`,
    [userId],
  );
  const u = rows[0];
  if (!u) return null;
  // Seviye 50 (LEVEL_CAP) = zirve: artık XP KAZANILMAZ. Hiçbir maçtan XP yazılmaz ve
  // istemciye xp_update GÖNDERİLMEZ (gönderenler `if (xpRes)` ile korunuyor) — böylece
  // maç sonrası XP küresi/animasyonu da hiç görünmez.
  if ((u.level ?? 1) >= LEVEL_CAP) return null;

  const today = new Date().toISOString().slice(0, 10);
  // 2x XP jetonu: pencere açıkken kazanılan ham XP ikiye katlanır. Bot maçında
  // katlama TAVANDAN ÖNCE uygulanır — günlük 60 XP bot tavanı delinmez.
  const boosted = !!u.xp_boost_until && new Date(u.xp_boost_until).getTime() > Date.now();
  let gained = 0;
  let botToday = u.bot_xp_day === today ? (u.bot_xp_today ?? 0) : 0;
  let lastWinDay = u.last_win_day;

  // Antrenman Bileti: aktif 1 saatlik pencere içindeyse bot maçlarındaki 60 XP
  // günlük tavanı bu süre boyunca tamamen kalkar.
  const trainingActive = !!u.training_boost_until && new Date(u.training_boost_until).getTime() > Date.now();
  if (vsBot) {
    const raw = (won ? 15 : 5) * (boosted ? 2 : 1);
    gained = trainingActive ? raw : Math.max(0, Math.min(raw, 60 - botToday)); // günlük bot tavanı
    botToday += gained;
  } else {
    gained = won ? 40 : 15;
    if (boosted) gained *= 2; // 2x YALNIZ maç XP'sini katlar
    if (won && lastWinDay !== today) {
      gained += 50; // günün ilk gerçek galibiyeti — 2x'ten etkilenmez (sınırlı değer)
      lastWinDay = today;
    }
  }

  // Seviye atlama döngüsü — ÖDÜL VERİLMEZ; hangi ödüllerin hazır olduğu
  // bilgisi popup için listelenir, toplamak oyuncuya kalır (claimLevelReward)
  let level = u.level ?? 1;
  let xp = (u.xp ?? 0) + gained;
  const leveledUp: LevelUpReward[] = [];
  while (level < LEVEL_CAP && xp >= xpForNext(level)) {
    xp -= xpForNext(level);
    level += 1;
    leveledUp.push({ level, diamonds: levelRewardDiamonds(level), powerId: LEVEL_POWERS[level] });
  }
  if (level >= LEVEL_CAP) xp = Math.min(xp, xpForNext(LEVEL_CAP)); // tavanda sabitlenir

  await pool.query(
    `UPDATE users SET
       xp = $2, level = $3, total_xp = total_xp + $7,
       last_win_day = $4, bot_xp_day = $5, bot_xp_today = $6
     WHERE id = $1`,
    [userId, xp, level, lastWinDay, vsBot ? today : u.bot_xp_day, vsBot ? botToday : (u.bot_xp_today ?? 0), gained],
  );

  return {
    xp,
    level,
    xpForNext: xpForNext(level),
    gained,
    leveledUp,
    boosted,
  };
}

// Bir seviyenin toplanabilir elmas ödülü (yolda gösterilenle birebir).
// Yalnız 5'in katları ödül taşır: güç seviyeleri 50, çerçeve seviyeleri 100.
// Ara seviyeler 0 — toplanacak bir şey yoktur.
export function levelRewardDiamonds(level: number): number {
  if (level % 5 !== 0) return 0;
  return level % 10 === 0 ? 100 : 50;
}


// ---- CO-PASS v2 toplama ----------------------------------------------------
// Güvenlik sözleşmesi v1 ile aynı: tek claim garantisi UPDATE'in KENDİ
// koşulunda (claimed_* dizisi @> kontrolü) — eşzamanlı iki dokunuş, iki cihaz
// ya da istek tekrarı ikinci kez 0 satır günceller. Seviye yetmiyorsa
// (level >= $2) ve premium şerit için pass açık değilse (premium_road = TRUE)
// yine 0 satır döner. Ödül kimlikleri kullanıcı girdisinden DEĞİL, yukarıdaki
// sabit tablodan gelir; istemci yalnız 'hangi seviye, hangi şerit' der.
//
// KOZMETİK TEKRARI: oyuncu o kozmetiğe zaten sahipse yeni bir para birimi ya
// da 'duplicate token' sistemi UYDURULMAZ — ödül elmasla telafi edilir
// (COSMETIC_DUPLICATE_DIAMONDS). Sahiplik okuması claim'den önce yapılır;
// yarış olsa bile owned_cosmetics'e DISTINCT ile yazıldığı için çift kayıt
// oluşmaz, en kötü ihtimalle telafi verilmez — elmas sızıntısı olmaz.
async function claimPassV2(
  userId: string,
  level: number,
  track: 'free' | 'premium',
): Promise<{ ok: true; claim: ClaimResult } | { ok: false; error: string }> {
  const premium = track === 'premium';
  const reward = passReward(level, track);
  if (!reward) return { ok: false, error: 'Bu seviyede ödül yok' };

  const claimedCol = premium ? 'claimed_premium' : 'claimed_levels';
  const sets: string[] = [`${claimedCol} = array_append(${claimedCol}, $2)`];
  const params: unknown[] = [userId, level];

  let diamonds = reward.diamonds ?? 0;
  let cosmeticId = reward.cosmeticId ?? null;
  let duplicateCompensated = false;

  if (cosmeticId) {
    const { rows: own } = await pool.query<{ has: boolean }>(
      `SELECT $2 = ANY(owned_cosmetics) AS has FROM users WHERE id = $1`, [userId, cosmeticId],
    );
    if (own[0]?.has) { duplicateCompensated = true; diamonds += COSMETIC_DUPLICATE_DIAMONDS; cosmeticId = null; }
  }

  if (diamonds > 0) { params.push(diamonds); sets.push(`diamonds = diamonds + $${params.length}`); }
  if (reward.roadPower) {
    const col = ROAD_POWER_COLUMN[reward.roadPower];
    sets.push(`${col} = ${col} + 1`);
  }
  if (reward.specialPower) {
    const col = SPECIAL_POWER_COLUMN[reward.specialPower];
    sets.push(`${col} = ${col} + 1`);
  }
  if (reward.frameTier) {
    params.push([reward.frameTier]);
    sets.push(`owned_frames = (SELECT ARRAY(SELECT DISTINCT f FROM unnest(owned_frames || $${params.length}::text[]) AS f))`);
  }
  if (cosmeticId) {
    params.push([cosmeticId]);
    sets.push(`owned_cosmetics = (SELECT ARRAY(SELECT DISTINCT c FROM unnest(owned_cosmetics || $${params.length}::text[]) AS c))`);
  }

  const { rows } = await pool.query<{ id: string; diamonds: number; season_id: string | null }>(
    `UPDATE users SET ${sets.join(', ')}
     WHERE id = $1 AND level >= $2 AND NOT (${claimedCol} @> ARRAY[$2::int])${premium ? `
       AND premium_road = TRUE` : ''}
     RETURNING id, diamonds, season_id`,
    params,
  );
  if (!rows[0]) {
    if (premium) return { ok: false, error: 'CO Pass açık değil ya da bu ödül zaten toplandı' };
    return { ok: false, error: 'Bu ödül henüz açılmadı ya da zaten toplandı' };
  }
  if (diamonds > 0) {
    void recordDiamondLedger({
      userId, amount: diamonds, balanceAfter: Number(rows[0].diamonds),
      reason: 'LEVEL_CLAIM', referenceId: `${track}:${level}`,
      idempotencyKey: `levelclaim:${userId}:${rows[0].season_id ?? 'legacy'}:${track}:${level}`,
    });
  }
  return {
    ok: true,
    claim: {
      level, diamonds, emoteId: null,
      frameTier: reward.frameTier ?? null,
      powerId: reward.roadPower ?? null,
      specialPowerId: reward.specialPower ?? null,
      cosmeticId, duplicateCompensated, track,
    },
  };
}

// ---- Sezon devrinde yolda kalan ödüller -----------------------------------
// (2026-09-01, oyuncu raporu: "geçen sezondan kalan ödüller kalıyor... almamız
// lazım"): sezon devri level=1 + claimed_levels='{}' yaparken ulaşılmış ama
// TOPLANMAMIŞ ödülleri hiç vermeden siliyordu. Oyuncu o seviyelere gerçekten
// ulaştı; toplasa alacağı şeyin devirde buharlaşması kayıp hissettirir (v2 yol
// sezon bitiminden 1 gün önce açıldı — 40 yeni ödülü toplamaya kimsenin vakti
// olmadı). Bu yardımcı, silinecek ödüllerin TOPLAMINI çıkarır; ensureSeason
// aynı UPDATE içinde hesaba yazar.
export interface RoadLeftovers {
  diamonds: number;
  columnBumps: Record<string, number>; // power_*/sp_* sütunu → eklenecek adet
  frames: string[];
  cosmetics: string[];                 // sahiplik DISTINCT merge ile korunur; telafi elması YOK
  claimedCount: number;                // kaç seviye ödülü derlendi (log için)
}

export function roadLeftovers(
  level: number,
  claimedFree: readonly number[],
  claimedPremium: readonly number[],
  premiumOwned: boolean,
): RoadLeftovers {
  const out: RoadLeftovers = { diamonds: 0, columnBumps: {}, frames: [], cosmetics: [], claimedCount: 0 };
  if (!copassV2Enabled()) return out; // eski yol: her ×5 zaten toplanmadan geçilmiyordu
  const doneFree = new Set(claimedFree);
  const donePrem = new Set(claimedPremium);
  const ekle = (r: PassReward | null): void => {
    if (!r) return;
    out.claimedCount += 1;
    if (r.diamonds) out.diamonds += r.diamonds;
    if (r.roadPower) { const c = ROAD_POWER_COLUMN[r.roadPower]; out.columnBumps[c] = (out.columnBumps[c] ?? 0) + 1; }
    if (r.specialPower) { const c = SPECIAL_POWER_COLUMN[r.specialPower]; out.columnBumps[c] = (out.columnBumps[c] ?? 0) + 1; }
    if (r.frameTier && !out.frames.includes(r.frameTier)) out.frames.push(r.frameTier);
    if (r.cosmeticId && !out.cosmetics.includes(r.cosmeticId)) out.cosmetics.push(r.cosmeticId);
  };
  for (let n = 1; n <= Math.min(level, 50); n++) {
    if (!doneFree.has(n)) ekle(passReward(n, 'free'));
    if (premiumOwned && !donePrem.has(n)) ekle(passReward(n, 'premium'));
  }
  return out;
}

const ROAD_POWER_COLUMN: Record<PowerId, string> = {
  xp2x: 'power_xp2x', shield: 'power_shield', streak: 'power_streak',
  training: 'power_training', socialtoken: 'power_socialtoken',
};
const SPECIAL_POWER_COLUMN: Record<SpecialPowerId, string> = {
  freeze: 'sp_freeze', reveal: 'sp_reveal', skip: 'sp_skip',
  extratime: 'sp_extratime', secondchance: 'sp_secondchance',
};

export interface ClaimResult {
  level: number;
  diamonds: number;        // bu toplamayla verilen elmas
  emoteId: string | null;  // bu toplamayla açılan özel ifade
  frameTier: string | null; // bu toplamayla açılan çerçeve kademesi
  powerId: PowerId | null; // bu toplamayla envantere eklenen güç
  track: 'free' | 'premium'; // hangi şeritten toplandı
  specialPowerId?: SpecialPowerId | null; // v2: maç içi güç
  cosmeticId?: string | null;             // v2: kozmetik
  duplicateCompensated?: boolean;         // kozmetik zaten vardı → elmasla telafi
}

const FRAME_TIER_BY_LEVEL: Record<number, string> = { 10: 'bronze', 20: 'silver', 30: 'gold', 40: 'diamond', 50: 'goat' };

// Seviye Yolu'nda karta dokununca: ödülü tek seferlik ver. Yarışa dayanıklı —
// claimed_levels denetimi UPDATE'in kendisinde (eşzamanlı çift dokunuş ikinciyi düşürür).
export async function claimLevelReward(
  userId: string,
  level: number,
  track: 'free' | 'premium' = 'free',
): Promise<{ ok: true; claim: ClaimResult } | { ok: false; error: string }> {
  if (!userId) return { ok: false, error: 'Önce giriş yap' };
  // v1: yalnız 5'in katları ödül taşır. v2: her seviyede ödül var (1..50).
  const v2 = copassV2Enabled();
  if (!Number.isInteger(level) || level < (v2 ? 1 : 5) || level > LEVEL_CAP || (!v2 && level % 5 !== 0)) {
    return { ok: false, error: 'Geçersiz seviye' };
  }
  const premium = track === 'premium';
  if (copassV2Enabled()) return claimPassV2(userId, level, track);
  const diamonds = premium ? premiumRewardDiamonds(level) : levelRewardDiamonds(level);
  const powerId = (premium ? PREMIUM_LEVEL_POWERS : LEVEL_POWERS)[level] ?? null;
  // Güç/claim sütunları kendi sabit haritalarımızdan gelir (kullanıcı girdisi
  // değil); tek claim garantisi UPDATE'in kendi denetiminde. Premium şerit
  // yalnız premium_road açıkken toplanabilir.
  const powerCol = powerId === 'xp2x' ? 'power_xp2x' : powerId === 'shield' ? 'power_shield' : powerId === 'streak' ? 'power_streak' : powerId === 'training' ? 'power_training' : powerId === 'socialtoken' ? 'power_socialtoken' : null;
  const claimedCol = premium ? 'claimed_premium' : 'claimed_levels';
  // Çerçeve sahipliği KALICI kayda da işlenir (owned_frames) — sezon sıfırlansa
  // bile kazanılmış çerçeve takılabilir kalır.
  const frameTier = premium ? null : FRAME_TIER_BY_LEVEL[level] ?? null;
  const { rows } = await pool.query<{ id: string; diamonds: number; season_id: string | null }>(
    `UPDATE users SET
       diamonds = diamonds + $3,
       ${claimedCol} = array_append(${claimedCol}, $2)${powerCol ? `,
       ${powerCol} = ${powerCol} + 1` : ''}${frameTier ? `,
       owned_frames = (SELECT ARRAY(SELECT DISTINCT f FROM unnest(owned_frames || $4::text[]) AS f))` : ''}
     WHERE id = $1 AND level >= $2 AND NOT (${claimedCol} @> ARRAY[$2::int])${premium ? `
       AND premium_road = TRUE` : ''}
     RETURNING id, diamonds, season_id`,
    frameTier ? [userId, level, diamonds, [frameTier]] : [userId, level, diamonds],
  );
  if (!rows[0]) {
    if (premium) return { ok: false, error: "CO Pass açık değil ya da bu ödül zaten toplandı" };
    return { ok: false, error: 'Bu ödül henüz açılmadı ya da zaten toplandı' };
  }
  if (diamonds > 0) {
    // Sezon kimliği anahtarda: claimed_levels her sezon sıfırlanır, aynı seviye
    // gelecek sezon yeniden toplanabilir — defterde çakışmasın.
    void recordDiamondLedger({
      userId, amount: diamonds, balanceAfter: Number(rows[0].diamonds),
      reason: 'LEVEL_CLAIM', referenceId: `${track}:${level}`,
      idempotencyKey: `levelclaim:${userId}:${rows[0].season_id ?? 'legacy'}:${track}:${level}`,
    });
  }
  return { ok: true, claim: { level, diamonds, emoteId: null, frameTier, powerId, track } };
}
