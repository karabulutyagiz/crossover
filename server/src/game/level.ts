// ---- Seviye sistemi ----
// Kupadan bağımsız, ASLA düşmeyen sadakat merdiveni. XP yalnız maç sonunda,
// SUNUCU tarafında yazılır (istemciye güvenilmez). Kurallar:
//   * Gerçek maç: galibiyet 40 XP, mağlubiyet 15 XP
//   * Günün ilk GERÇEK galibiyeti: +50 XP bonus
//   * Bot maçı: galibiyet 15 / mağlubiyet 5, günlük tavan 60 XP (farm koruması)
//   * Seviye eşiği: 100 + (seviye-1) × 25 XP, tavan 50
// Ödüller (seviye atlanan HER seviye için):
//   * +20 elmas; 5'in katlarında +50 elmas daha ve seviyeye özel ifade
//   * 10'un katları istemcide çerçeve kademesi açar (sunucuda ayrıca kayıt yok —
//     çerçeve doğrudan seviyeden türetilir)
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

  // Seviye atlama döngüsü + ödül toplama
  let level = u.level ?? 1;
  let xp = (u.xp ?? 0) + gained;
  const leveledUp: LevelUpReward[] = [];
  const owned = new Set(u.owned_emotes ?? []);
  const newEmotes: string[] = [];
  let diamondGain = 0;
  while (level < LEVEL_CAP && xp >= xpForNext(level)) {
    xp -= xpForNext(level);
    level += 1;
    let d = 20;
    if (level % 5 === 0) d += 50;
    diamondGain += d;
    const emoteId = LEVEL_EMOTES[level];
    if (emoteId && !owned.has(emoteId)) {
      owned.add(emoteId);
      newEmotes.push(emoteId);
    }
    leveledUp.push({ level, diamonds: d, emoteId });
  }
  if (level >= LEVEL_CAP) xp = Math.min(xp, xpForNext(LEVEL_CAP)); // tavanda sabitlenir

  const { rows: updated } = await pool.query<{ diamonds: number }>(
    `UPDATE users SET
       xp = $2, level = $3,
       diamonds = diamonds + $4,
       owned_emotes = (SELECT ARRAY(SELECT DISTINCT e FROM unnest(owned_emotes || $5::text[]) AS e)),
       last_win_day = $6, bot_xp_day = $7, bot_xp_today = $8
     WHERE id = $1
     RETURNING diamonds`,
    [userId, xp, level, diamondGain, newEmotes, lastWinDay, vsBot ? today : u.bot_xp_day, vsBot ? botToday : (u.bot_xp_today ?? 0)],
  );

  return {
    xp,
    level,
    xpForNext: xpForNext(level),
    gained,
    leveledUp,
    diamonds: diamondGain > 0 ? updated[0]?.diamonds : undefined,
  };
}
