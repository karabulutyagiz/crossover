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
