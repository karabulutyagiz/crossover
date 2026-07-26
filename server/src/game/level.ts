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
//   * Her seviye: +20 elmas; 5'in katları: +70 elmas ve (varsa) özel ifade
//   * 10'un katları: kademe çerçevesi — TAKMAK için de toplanmış olması şart
import { pool } from '../db/pool.ts';

export const LEVEL_CAP = 50;

export function xpForNext(level: number): number {
  return 100 + (level - 1) * 25;
}

// 5'in katı seviyelerde açılan, mağazada satılmayan özel ifadeler.
// (İstemcideki ANIM_EMOTES setiyle birebir aynı kimlikler.)
export const LEVEL_EMOTES: Record<number, string> = {
  5: 'footballer',
  15: 'kick',
  25: 'squad',
  35: 'pitch',
  45: 'euro2024',
};

export interface LevelUpReward {
  level: number;
  diamonds: number;
  emoteId?: string;
}

export interface XpAward {
  xp: number;          // mevcut seviye İÇİNDEKİ ilerleme
  level: number;
  xpForNext: number;   // bu seviyeyi bitirmek için gereken toplam
  gained: number;      // bu maçtan kazanılan XP
  leveledUp: LevelUpReward[];
  diamonds?: number;   // ödüller sonrası güncel bakiye (değiştiyse)
}

interface LevelRow {
  xp: number;
  level: number;
  last_win_day: string | null;
  bot_xp_day: string | null;
  bot_xp_today: number | null;
  diamonds: number;
  owned_emotes: string[] | null;
}

export async function awardMatchXp(userId: string, won: boolean, vsBot: boolean): Promise<XpAward | null> {
  if (!userId) return null;
  const { rows } = await pool.query<LevelRow>(
    `SELECT xp, level, last_win_day, bot_xp_day, bot_xp_today, diamonds, owned_emotes
     FROM users WHERE id = $1`,
    [userId],
  );
  const u = rows[0];
  if (!u) return null;

  const today = new Date().toISOString().slice(0, 10);
  let gained = 0;
  let botToday = u.bot_xp_day === today ? (u.bot_xp_today ?? 0) : 0;
  let lastWinDay = u.last_win_day;

  if (vsBot) {
    const raw = won ? 15 : 5;
    gained = Math.max(0, Math.min(raw, 60 - botToday)); // günlük bot tavanı
    botToday += gained;
  } else {
    gained = won ? 40 : 15;
    if (won && lastWinDay !== today) {
      gained += 50; // günün ilk gerçek galibiyeti
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
    leveledUp.push({ level, diamonds: levelRewardDiamonds(level), emoteId: LEVEL_EMOTES[level] });
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
  };
}

// Bir seviyenin toplanabilir elmas ödülü (yolda gösterilenle birebir).
export function levelRewardDiamonds(level: number): number {
  return level % 5 === 0 ? 70 : 20;
}

export interface ClaimResult {
  level: number;
  diamonds: number;        // bu toplamayla verilen elmas
  emoteId: string | null;  // bu toplamayla açılan özel ifade
  frameTier: string | null; // bu toplamayla açılan çerçeve kademesi
}

const FRAME_TIER_BY_LEVEL: Record<number, string> = { 10: 'bronze', 20: 'silver', 30: 'gold', 40: 'diamond', 50: 'goat' };

// Seviye Yolu'nda karta dokununca: ödülü tek seferlik ver. Yarışa dayanıklı —
// claimed_levels denetimi UPDATE'in kendisinde (eşzamanlı çift dokunuş ikinciyi düşürür).
export async function claimLevelReward(
  userId: string,
  level: number,
): Promise<{ ok: true; claim: ClaimResult } | { ok: false; error: string }> {
  if (!userId) return { ok: false, error: 'Önce giriş yap' };
  if (!Number.isInteger(level) || level < 2 || level > LEVEL_CAP) return { ok: false, error: 'Geçersiz seviye' };
  const diamonds = levelRewardDiamonds(level);
  const emoteId = LEVEL_EMOTES[level] ?? null;
  const { rows } = await pool.query<{ id: string }>(
    `UPDATE users SET
       diamonds = diamonds + $3,
       owned_emotes = (SELECT ARRAY(SELECT DISTINCT e FROM unnest(owned_emotes || $4::text[]) AS e)),
       claimed_levels = array_append(claimed_levels, $2)
     WHERE id = $1 AND level >= $2 AND NOT (claimed_levels @> ARRAY[$2::int])
     RETURNING id`,
    [userId, level, diamonds, emoteId ? [emoteId] : []],
  );
  if (!rows[0]) return { ok: false, error: 'Bu ödül henüz açılmadı ya da zaten toplandı' };
  return { ok: true, claim: { level, diamonds, emoteId, frameTier: FRAME_TIER_BY_LEVEL[level] ?? null } };
}
