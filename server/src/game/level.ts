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

export function xpForNext(level: number): number {
  return 100 + (level - 1) * 25;
}

// Özel güçler — Seviye Yolu'ndan kazanılan TEK KULLANIMLIK, stoklanabilir
// tüketilebilirler (elmasla SATILMAZ). Çerçeve olmayan ×5 seviyelerinde
// dönüşümlü dağıtılır.
//   xp2x  : 1 saat boyunca kazanılan tüm XP ikiye katlanır
//   shield: kuşanılır; sıradaki dereceli mağlubiyette kupa kaybını bir kez emer
//   streak: son mağlubiyette kırılan galibiyet serisini geri yükler (anında)
export type PowerId = 'xp2x' | 'shield' | 'streak';
export const LEVEL_POWERS: Record<number, PowerId> = {
  5: 'xp2x',
  15: 'shield',
  25: 'streak',
  35: 'xp2x',
  45: 'shield',
};

// ---- PREMIUM Seviye Yolu ----
// 1000 elmasla bir kez açılır (users.premium_road). Ücretsiz yolun YANINDA
// akan ikinci şerit: HER ×5 seviyesinde bir güç (dönüşümlü) + daha dolgun
// elmas (×5: 100, ×10: 200, zirve 50: 300 → toplam 1600💎 + 10 güç).
export const PREMIUM_ROAD_PRICE = 1000;
export const PREMIUM_LEVEL_POWERS: Record<number, PowerId> = {
  5: 'xp2x', 10: 'shield', 15: 'streak',
  20: 'xp2x', 25: 'shield', 30: 'streak',
  35: 'xp2x', 40: 'shield', 45: 'streak',
  50: 'xp2x',
};

export function premiumRewardDiamonds(level: number): number {
  if (level % 5 !== 0) return 0;
  if (level === LEVEL_CAP) return 300;
  return level % 10 === 0 ? 200 : 100;
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
}

export async function awardMatchXp(userId: string, won: boolean, vsBot: boolean): Promise<XpAward | null> {
  if (!userId) return null;
  const { rows } = await pool.query<LevelRow>(
    `SELECT xp, level, last_win_day, bot_xp_day, bot_xp_today, diamonds, owned_emotes, xp_boost_until
     FROM users WHERE id = $1`,
    [userId],
  );
  const u = rows[0];
  if (!u) return null;

  const today = new Date().toISOString().slice(0, 10);
  // 2x XP jetonu: pencere açıkken kazanılan ham XP ikiye katlanır. Bot maçında
  // katlama TAVANDAN ÖNCE uygulanır — günlük 60 XP bot tavanı delinmez.
  const boosted = !!u.xp_boost_until && new Date(u.xp_boost_until).getTime() > Date.now();
  let gained = 0;
  let botToday = u.bot_xp_day === today ? (u.bot_xp_today ?? 0) : 0;
  let lastWinDay = u.last_win_day;

  if (vsBot) {
    const raw = (won ? 15 : 5) * (boosted ? 2 : 1);
    gained = Math.max(0, Math.min(raw, 60 - botToday)); // günlük bot tavanı
    botToday += gained;
  } else {
    gained = won ? 40 : 15;
    if (won && lastWinDay !== today) {
      gained += 50; // günün ilk gerçek galibiyeti
      lastWinDay = today;
    }
    if (boosted) gained *= 2;
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
  const powerCol = powerId === 'xp2x' ? 'power_xp2x' : powerId === 'shield' ? 'power_shield' : powerId === 'streak' ? 'power_streak' : null;
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
    if (premium) return { ok: false, error: "Premium Yol açık değil ya da bu ödül zaten toplandı" };
    return { ok: false, error: 'Bu ödül henüz açılmadı ya da zaten toplandı' };
  }
  return { ok: true, claim: { level, diamonds, emoteId: null, frameTier, powerId, track } };
}
