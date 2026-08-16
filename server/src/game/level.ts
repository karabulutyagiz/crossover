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

export const LEVEL_CAP = 50;

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
// 1000 elmasla bir kez açılır (users.premium_road). Ücretsiz yolun YANINDA
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
       xp = $2, level = $3,
       last_win_day = $4, bot_xp_day = $5, bot_xp_today = $6
     WHERE id = $1`,
    [userId, xp, level, lastWinDay, vsBot ? today : u.bot_xp_day, vsBot ? botToday : (u.bot_xp_today ?? 0)],
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

export interface ClaimResult {
  level: number;
  diamonds: number;        // bu toplamayla verilen elmas
  emoteId: string | null;  // bu toplamayla açılan özel ifade
  frameTier: string | null; // bu toplamayla açılan çerçeve kademesi
  powerId: PowerId | null; // bu toplamayla envantere eklenen güç
  track: 'free' | 'premium'; // hangi şeritten toplandı
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
  // Yalnız 5'in katları ödül taşır — ara seviyelerde toplanacak bir şey yok.
  if (!Number.isInteger(level) || level < 5 || level > LEVEL_CAP || level % 5 !== 0) {
    return { ok: false, error: 'Geçersiz seviye' };
  }
  const premium = track === 'premium';
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
  const { rows } = await pool.query<{ id: string }>(
    `UPDATE users SET
       diamonds = diamonds + $3,
       ${claimedCol} = array_append(${claimedCol}, $2)${powerCol ? `,
       ${powerCol} = ${powerCol} + 1` : ''}${frameTier ? `,
       owned_frames = (SELECT ARRAY(SELECT DISTINCT f FROM unnest(owned_frames || $4::text[]) AS f))` : ''}
     WHERE id = $1 AND level >= $2 AND NOT (${claimedCol} @> ARRAY[$2::int])${premium ? `
       AND premium_road = TRUE` : ''}
     RETURNING id`,
    frameTier ? [userId, level, diamonds, [frameTier]] : [userId, level, diamonds],
  );
  if (!rows[0]) {
    if (premium) return { ok: false, error: "CO Pass açık değil ya da bu ödül zaten toplandı" };
    return { ok: false, error: 'Bu ödül henüz açılmadı ya da zaten toplandı' };
  }
  return { ok: true, claim: { level, diamonds, emoteId: null, frameTier, powerId, track } };
}
