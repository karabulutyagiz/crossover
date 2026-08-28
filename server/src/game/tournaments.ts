// ═══════════════════════════════════════════════════════════════════════════
// TURNUVALAR (2026-08-28) — tek elemeli ödüllü bracket (Kafa Topu / CR tarzı).
// Admin turnuvayı oluşturur (SQL/panel), oyuncular uygulamadan kayıt olur;
// kontenjan DOLUNCA ağaç kurulur (karışık seed) ve turnuva canlıya geçer.
// Maçlar dostluk-maçı altyapısıyla (ranked=false, team-team) oynanır; oda
// kazananı buraya rapor edilir, kazanan üst tura yazılır. Final bitince
// ödüller elmas olarak DOĞRUDAN hesaba yazılır (kazanan + finalist).
// Otorite tamamen sunucu: istemci yalnız görüntüler ve 'hazırım' der.
// ═══════════════════════════════════════════════════════════════════════════
import { pool } from '../db/pool.ts';
import { log } from '../logger.ts';

export interface TournamentListItem {
  id: string;
  name: string;
  size: number;
  joined: number;
  youJoined: boolean;
  status: 'registration' | 'live' | 'finished';
  prizeFirst: number;
  prizeSecond: number;
  winnerName?: string | null;
}

export interface BracketMatchView {
  id: string;
  round: number;
  slot: number;
  aId: string | null;
  aName: string | null;
  bId: string | null;
  bName: string | null;
  winnerId: string | null;
  status: string;
}

export interface TournamentStateView {
  id: string;
  name: string;
  size: number;
  status: 'registration' | 'live' | 'finished';
  prizeFirst: number;
  prizeSecond: number;
  joined: number;
  youJoined: boolean;
  players: { userId: string; name: string }[];
  matches: BracketMatchView[];
  winnerName: string | null;
}

/** Kayıt açık + canlı + son bitenler (24s) — lobi listesi. */
export async function listTournaments(viewerUserId: string | null): Promise<TournamentListItem[]> {
  const { rows } = await pool.query<{
    id: string; name: string; size: number; status: string; prize_first: number; prize_second: number;
    joined: string; you_joined: boolean; winner_name: string | null;
  }>(
    `SELECT t.id, t.name, t.size, t.status, t.prize_first, t.prize_second,
            (SELECT count(*) FROM tournament_players tp WHERE tp.tournament_id = t.id) AS joined,
            EXISTS (SELECT 1 FROM tournament_players tp2 WHERE tp2.tournament_id = t.id AND tp2.user_id = $1) AS you_joined,
            w.display_name AS winner_name
       FROM tournaments t
       LEFT JOIN users w ON w.id = t.winner_user_id
      WHERE t.status IN ('registration', 'live')
         OR (t.status = 'finished' AND t.finished_at > now() - interval '24 hours')
      ORDER BY CASE t.status WHEN 'live' THEN 0 WHEN 'registration' THEN 1 ELSE 2 END, t.created_at DESC
      LIMIT 20`,
    [viewerUserId],
  );
  return rows.map((r) => ({
    id: r.id, name: r.name, size: r.size,
    joined: Number(r.joined), youJoined: r.you_joined,
    status: r.status as TournamentListItem['status'],
    prizeFirst: r.prize_first, prizeSecond: r.prize_second,
    winnerName: r.winner_name,
  }));
}

export async function getTournamentState(tid: string, viewerUserId: string | null): Promise<TournamentStateView | null> {
  const { rows: trows } = await pool.query<{
    id: string; name: string; size: number; status: string; prize_first: number; prize_second: number; winner_name: string | null;
  }>(
    `SELECT t.id, t.name, t.size, t.status, t.prize_first, t.prize_second, w.display_name AS winner_name
       FROM tournaments t LEFT JOIN users w ON w.id = t.winner_user_id WHERE t.id = $1`,
    [tid],
  );
  const t = trows[0];
  if (!t) return null;
  const { rows: prows } = await pool.query<{ user_id: string; name: string }>(
    `SELECT tp.user_id, u.display_name AS name FROM tournament_players tp JOIN users u ON u.id = tp.user_id
      WHERE tp.tournament_id = $1 ORDER BY tp.seed`,
    [tid],
  );
  const { rows: mrows } = await pool.query<{
    id: string; round: number; slot: number; player_a: string | null; player_b: string | null;
    winner: string | null; status: string; a_name: string | null; b_name: string | null;
  }>(
    `SELECT m.id, m.round, m.slot, m.player_a, m.player_b, m.winner, m.status,
            ua.display_name AS a_name, ub.display_name AS b_name
       FROM tournament_matches m
       LEFT JOIN users ua ON ua.id = m.player_a
       LEFT JOIN users ub ON ub.id = m.player_b
      WHERE m.tournament_id = $1
      ORDER BY m.round, m.slot`,
    [tid],
  );
  return {
    id: t.id, name: t.name, size: t.size,
    status: t.status as TournamentStateView['status'],
    prizeFirst: t.prize_first, prizeSecond: t.prize_second,
    joined: prows.length,
    youJoined: viewerUserId != null && prows.some((p) => p.user_id === viewerUserId),
    players: prows.map((p) => ({ userId: p.user_id, name: p.name })),
    matches: mrows.map((m) => ({
      id: m.id, round: m.round, slot: m.slot,
      aId: m.player_a, aName: m.a_name, bId: m.player_b, bName: m.b_name,
      winnerId: m.winner, status: m.status,
    })),
    winnerName: t.winner_name,
  };
}

/** Kayıt: kontenjan dolarsa ağacı kurup canlıya geçirir. { started } dolduysa true. */
export async function joinTournament(tid: string, userId: string): Promise<{ ok: boolean; error?: string; started?: boolean }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ size: number; status: string }>(
      `SELECT size, status FROM tournaments WHERE id = $1 FOR UPDATE`, [tid],
    );
    const t = rows[0];
    if (!t) { await client.query('ROLLBACK'); return { ok: false, error: 'Turnuva bulunamadı' }; }
    if (t.status !== 'registration') { await client.query('ROLLBACK'); return { ok: false, error: 'Kayıtlar kapandı' }; }
    const { rows: cnt } = await client.query<{ n: string }>(
      `SELECT count(*) AS n FROM tournament_players WHERE tournament_id = $1`, [tid],
    );
    const joined = Number(cnt[0]!.n);
    if (joined >= t.size) { await client.query('ROLLBACK'); return { ok: false, error: 'Turnuva dolu' }; }
    await client.query(
      `INSERT INTO tournament_players (tournament_id, user_id, seed) VALUES ($1, $2, $3)
       ON CONFLICT (tournament_id, user_id) DO NOTHING`,
      [tid, userId, joined],
    );
    const { rows: cnt2 } = await client.query<{ n: string }>(
      `SELECT count(*) AS n FROM tournament_players WHERE tournament_id = $1`, [tid],
    );
    let started = false;
    if (Number(cnt2[0]!.n) >= t.size) {
      // ── Ağacı kur: oyuncuları karıştır, 1. tur eşleşmelerini + boş üst turları yaz ──
      const { rows: players } = await client.query<{ user_id: string }>(
        `SELECT user_id FROM tournament_players WHERE tournament_id = $1 ORDER BY joined_at`, [tid],
      );
      const shuffled = [...players.map((p) => p.user_id)];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
      }
      const rounds = Math.log2(t.size);
      for (let r = 1; r <= rounds; r++) {
        const matchesInRound = t.size / Math.pow(2, r);
        for (let slot = 0; slot < matchesInRound; slot++) {
          const a = r === 1 ? shuffled[slot * 2] ?? null : null;
          const b = r === 1 ? shuffled[slot * 2 + 1] ?? null : null;
          await client.query(
            `INSERT INTO tournament_matches (tournament_id, round, slot, player_a, player_b) VALUES ($1, $2, $3, $4, $5)`,
            [tid, r, slot, a, b],
          );
        }
      }
      await client.query(`UPDATE tournaments SET status = 'live', started_at = now() WHERE id = $1`, [tid]);
      started = true;
      log.info('tournament_started', { tournamentId: tid, size: t.size });
    }
    await client.query('COMMIT');
    return { ok: true, started };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    log.error('tournament_join_failed', { tournamentId: tid, userId, error: err instanceof Error ? err.message : String(err) });
    return { ok: false, error: 'Kayıt başarısız, tekrar dene' };
  } finally {
    client.release();
  }
}

export async function leaveTournament(tid: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const { rows } = await pool.query<{ status: string }>(`SELECT status FROM tournaments WHERE id = $1`, [tid]);
  if (!rows[0]) return { ok: false, error: 'Turnuva bulunamadı' };
  if (rows[0].status !== 'registration') return { ok: false, error: 'Turnuva başladı — çıkılamaz' };
  await pool.query(`DELETE FROM tournament_players WHERE tournament_id = $1 AND user_id = $2`, [tid, userId]);
  return { ok: true };
}

/** Kullanıcının OYNANMAYI bekleyen turnuva maçları (iki taraf da belli, kazanan yok). */
export async function pendingTournamentMatchesFor(userId: string): Promise<{ matchId: string; tournamentId: string; opponentId: string; opponentName: string; tournamentName: string; round: number }[]> {
  const { rows } = await pool.query<{ id: string; tournament_id: string; opp_id: string; opp_name: string; t_name: string; round: number }>(
    `SELECT m.id, m.tournament_id, m.round,
            CASE WHEN m.player_a = $1 THEN m.player_b ELSE m.player_a END AS opp_id,
            u.display_name AS opp_name, t.name AS t_name
       FROM tournament_matches m
       JOIN tournaments t ON t.id = m.tournament_id AND t.status = 'live'
       JOIN users u ON u.id = (CASE WHEN m.player_a = $1 THEN m.player_b ELSE m.player_a END)
      WHERE (m.player_a = $1 OR m.player_b = $1)
        AND m.player_a IS NOT NULL AND m.player_b IS NOT NULL
        AND m.winner IS NULL AND m.status <> 'playing'`,
    [userId],
  );
  return rows.map((r) => ({ matchId: r.id, tournamentId: r.tournament_id, opponentId: r.opp_id, opponentName: r.opp_name, tournamentName: r.t_name, round: r.round }));
}

export async function markMatchPlaying(matchId: string): Promise<void> {
  await pool.query(`UPDATE tournament_matches SET status = 'playing' WHERE id = $1 AND winner IS NULL`, [matchId]);
}

/** Oda bitince: kazananı yaz, üst tura taşı; final ise ödülleri dağıt.
 * Dönen finished=true ise turnuva bitti (winner/second isimleriyle). */
export async function reportTournamentResult(matchId: string, winnerUserId: string | null): Promise<{
  tournamentId: string; finished: boolean; winnerUserId?: string; secondUserId?: string;
  prizeFirst?: number; prizeSecond?: number;
} | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{
      id: string; tournament_id: string; round: number; slot: number; player_a: string | null; player_b: string | null; winner: string | null;
    }>(`SELECT id, tournament_id, round, slot, player_a, player_b, winner FROM tournament_matches WHERE id = $1 FOR UPDATE`, [matchId]);
    const m = rows[0];
    if (!m || m.winner) { await client.query('ROLLBACK'); return null; } // yok ya da zaten yazılmış (çifte rapor)
    // Kazanan maçın oyuncularından biri olmalı; null (berabere/iki taraf da düştü)
    // gelirse maç 'pending'e döner — tekrar oynanır.
    if (!winnerUserId || (winnerUserId !== m.player_a && winnerUserId !== m.player_b)) {
      await client.query(`UPDATE tournament_matches SET status = 'pending' WHERE id = $1`, [matchId]);
      await client.query('COMMIT');
      return { tournamentId: m.tournament_id, finished: false };
    }
    await client.query(`UPDATE tournament_matches SET winner = $2, status = 'done' WHERE id = $1`, [matchId, winnerUserId]);
    // Üst tur: slot>>1'e, çift slot → player_a, tek slot → player_b.
    const { rows: trows } = await client.query<{ size: number; prize_first: number; prize_second: number }>(
      `SELECT size, prize_first, prize_second FROM tournaments WHERE id = $1`, [m.tournament_id],
    );
    const size = trows[0]!.size;
    const finalRound = Math.log2(size);
    let finished = false;
    let secondUserId: string | undefined;
    if (m.round >= finalRound) {
      // FİNAL — turnuva bitti, ödüller yazılır.
      finished = true;
      secondUserId = (winnerUserId === m.player_a ? m.player_b : m.player_a) ?? undefined;
      await client.query(
        `UPDATE tournaments SET status = 'finished', finished_at = now(), winner_user_id = $2 WHERE id = $1`,
        [m.tournament_id, winnerUserId],
      );
      await client.query(`UPDATE users SET diamonds = diamonds + $2 WHERE id = $1`, [winnerUserId, trows[0]!.prize_first]);
      if (secondUserId && trows[0]!.prize_second > 0) {
        await client.query(`UPDATE users SET diamonds = diamonds + $2 WHERE id = $1`, [secondUserId, trows[0]!.prize_second]);
      }
      log.info('tournament_finished', { tournamentId: m.tournament_id, winnerUserId, prize: trows[0]!.prize_first });
    } else {
      const col = m.slot % 2 === 0 ? 'player_a' : 'player_b';
      await client.query(
        `UPDATE tournament_matches SET ${col} = $3 WHERE tournament_id = $1 AND round = $2 AND slot = $4`,
        [m.tournament_id, m.round + 1, winnerUserId, Math.floor(m.slot / 2)],
      );
    }
    await client.query('COMMIT');
    return { tournamentId: m.tournament_id, finished, winnerUserId, secondUserId, prizeFirst: trows[0]!.prize_first, prizeSecond: trows[0]!.prize_second };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    log.error('tournament_report_failed', { matchId, error: err instanceof Error ? err.message : String(err) });
    return null;
  } finally {
    client.release();
  }
}

/** Turnuvanın tüm oyuncu id'leri (canlı yayın hedefi). */
export async function tournamentMemberIds(tid: string): Promise<string[]> {
  const { rows } = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM tournament_players WHERE tournament_id = $1`, [tid],
  );
  return rows.map((r) => r.user_id);
}
