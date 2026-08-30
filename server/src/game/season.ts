// ============================================================================
// SEZON ÖZETİ (2026-08-29) — aylık döngünün görünür yüzü.
//
// Aylık sezon zaten vardı (rank.ts ensureSeason: ay değişince level/xp/yol
// sıfırlanır, kozmetik ve elmas kalır) ama oyuncuya HİÇ gösterilmiyordu.
// Bu modül "hangi sezondayız, ne kadar kaldı, bu sezon ne yaptım, geçen sezon
// nereye ulaştım" sorularını cevaplar.
//
// ÖDÜL YOK: elmas/güç dağıtılmaz (seri ödülleri kapatılırken alınan karar
// korunur). Değer prestijdir — Haftalık Lig'in küme rozetiyle aynı ilke.
// ============================================================================
import { pool } from '../db/pool.ts';
import { ARENAS, currentSeasonId, getArena } from './rank.ts';

export interface SeasonStateView {
  seasonId: string;        // 'YYYY-MM'
  endsAt: string;          // sezonun bittiği an (İstanbul ay sonu), ISO
  peakTrophies: number;    // bu sezonun zirvesi (kupa düşse de korunur)
  peakArenaName: string;
  wins: number;
  losses: number;
  last: {                  // geçen sezonun dondurulmuş özeti (varsa)
    seasonId: string;
    peakTrophies: number;
    peakArenaName: string;
    wins: number;
    losses: number;
  } | null;
}

/** Sezonun bitiş anı: İstanbul saatiyle bir sonraki ayın 1'i, 00:00. */
export function seasonEndsAt(seasonId: string): string {
  const [y, m] = seasonId.split('-').map(Number);
  if (!y || !m) return new Date().toISOString();
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const utcMidnight = Date.UTC(nextY, nextM - 1, 1, 0, 0, 0);
  return new Date(utcMidnight - 3 * 3600_000).toISOString(); // İstanbul = UTC+3
}

function arenaName(trophies: number): string {
  return getArena(trophies).name;
}

export async function getSeasonState(userId: string): Promise<SeasonStateView | null> {
  const { rows } = await pool.query<{
    season_id: string | null; trophies: number;
    season_peak_trophies: number | null; season_wins: number | null; season_losses: number | null;
  }>(
    `SELECT season_id, trophies, season_peak_trophies, season_wins, season_losses
       FROM users WHERE id = $1`,
    [userId],
  );
  const u = rows[0];
  if (!u) return null;
  const seasonId = u.season_id ?? currentSeasonId();
  const peak = Math.max(u.season_peak_trophies ?? 0, u.trophies ?? 0);

  const { rows: lastRows } = await pool.query<{
    season_id: string; peak_trophies: number; peak_arena: number; wins: number; losses: number;
  }>(
    `SELECT season_id, peak_trophies, peak_arena, wins, losses
       FROM season_summaries WHERE user_id = $1 ORDER BY season_id DESC LIMIT 1`,
    [userId],
  );
  const l = lastRows[0];

  return {
    seasonId,
    endsAt: seasonEndsAt(seasonId),
    peakTrophies: peak,
    peakArenaName: arenaName(peak),
    wins: u.season_wins ?? 0,
    losses: u.season_losses ?? 0,
    last: l ? {
      seasonId: l.season_id,
      peakTrophies: l.peak_trophies,
      peakArenaName: ARENAS[l.peak_arena]?.name ?? arenaName(l.peak_trophies),
      wins: l.wins,
      losses: l.losses,
    } : null,
  };
}

// ============================================================================
// SEZON KAPANIŞI: KUPA YUMUŞAK SIFIRLAMA + ÖDÜLLER (2026-08-30)
// ============================================================================
// Kullanıcı kararı: "sezon bitiminde kupalar biraz açılacak, sezon ödülleri
// verilecek". Önceki karar (sezon ödül DAĞITMAZ, değeri prestijdir) bilinçli
// olarak değiştirildi — ama elmas musluğu dar tutuldu, aşağıdaki gerekçeye bak.
//
// KUPA SIFIRLAMA — eşik 1000, fazlalığın %30'u silinir:
//   4759 → 3631 · 1500 → 1350 · 999 → 999 (dokunulmaz)
// Eşik neden 1000: canlı dağılımda oyuncuların %97'si bunun ALTINDA (780/1014
// oyuncu 0-199 bandında). Yani reset yalnız tepedeki ~32 kişiyi etkiler, yeni
// oyuncu hiçbir şey kaybetmez ve zirve yarışı yeniden açılır.
//
// ÖDÜL BANDI — sezon ZİRVESİNE göre (season_peak_trophies), anlık kupaya değil:
// sezon içinde 1200'e çıkıp 900'e düşen oyuncu hak ettiğini kaybetmez.
export const SEASON_TROPHY_RESET_FLOOR = 1000;
export const SEASON_TROPHY_KEEP_RATIO = 0.7; // eşik üstü fazlalığın korunan payı

export function seasonTrophyReset(trophies: number): number {
  if (trophies <= SEASON_TROPHY_RESET_FLOOR) return trophies;
  const fazla = trophies - SEASON_TROPHY_RESET_FLOOR;
  return Math.round(SEASON_TROPHY_RESET_FLOOR + fazla * SEASON_TROPHY_KEEP_RATIO);
}

export interface SeasonReward {
  diamonds: number;
  specialPower: 'extratime' | 'freeze' | 'reveal' | null;
  frameTier: string | null;    // owned_frames
  cosmeticId: string | null;   // owned_cosmetics
  avatarId: string;            // owned_avatars — HERKESE
}

// Elmas rakamları bilerek düşük: en kalabalık bant (780 kişi) 25💎 alıyor.
// 100💎 verseydik tek başına 78.000💎 basardı ve elmas satışını çökertirdi.
// Yine de herkes bir şey alır — kimse eli boş kalmaz.
export function seasonRewardFor(peakTrophies: number): SeasonReward {
  const taban = { avatarId: 'pp35' };                      // S1 rozeti — herkese
  const prestij = { frameTier: 'season1', cosmeticId: 'season1_arena' }; // 1000+
  if (peakTrophies >= 5000) return { ...taban, ...prestij, diamonds: 1200, specialPower: 'reveal' };
  if (peakTrophies >= 3500) return { ...taban, ...prestij, diamonds: 800, specialPower: 'reveal' };
  if (peakTrophies >= 2000) return { ...taban, ...prestij, diamonds: 500, specialPower: 'reveal' };
  if (peakTrophies >= 1000) return { ...taban, ...prestij, diamonds: 250, specialPower: 'freeze' };
  if (peakTrophies >= 500)  return { ...taban, frameTier: null, cosmeticId: null, diamonds: 100, specialPower: 'extratime' };
  if (peakTrophies >= 200)  return { ...taban, frameTier: null, cosmeticId: null, diamonds: 50, specialPower: null };
  return { ...taban, frameTier: null, cosmeticId: null, diamonds: 25, specialPower: null };
}

/** Sezon kapanış ödülleri açık mı (canlıya alınana dek kapalı). */
export function seasonRewardsEnabled(): boolean {
  return process.env.SEASON_REWARDS_ENABLED === '1';
}
