// ============================================================================
// GÜNÜN CROSSOVER'I (2026-08-27) — Wordle döngüsü: herkese aynı günlük soru.
//
// KURALLAR:
//  * Gün sınırı Europe/Istanbul (sabit UTC+3, sezon mantığıyla aynı yaklaşım).
//  * Çift SUNUCU-OTORİTER ve DETERMİNİSTİK seçilir; ilk yazan kazanır
//    (daily_crossover_days'e ON CONFLICT DO NOTHING) — restart/çoklu-instance
//    aynı günü asla farklı soruyla gösteremez.
//  * Oyuncu başına günde TEK oynayış (PK user_id+day_idx), 3 tahmin hakkı.
//    Deneme sayacı ve süre DB'de tutulur — uygulamayı yeniden başlatmak hak
//    tazelemez, süreyi sıfırlamaz.
//  * Doğru bilene DAILY_REWARD elmas (deftere idempotent yazılır) + seri sayacı.
//  * Paylaşım kartını istemci üretir; sunucu yalnız sonucu ve seriyi verir.
// ============================================================================
import { createHash } from 'node:crypto';
import { pool } from '../db/pool.ts';
import type { ClubRef, DailyCrossoverStateView } from '../protocol.ts';
import { verifyGuess, commonPlayersDetailed, type VerifyResult } from './verify.ts';
import { clubPopularityTier, isTurkishClub } from './clubPopularity.ts';
import { recordDiamondLedger } from './diamondLedger.ts';

export const DAILY_CX_REWARD = 10; // 💎 — reklam ödülünün 2 katı, günde 1 kez
const MAX_GUESSES = 3;
const IST_OFFSET_MS = 3 * 3600_000; // Europe/Istanbul sabit UTC+3
const DAY_MS = 86_400_000;
// Cevap derinliği tabanı: en az bu kadar ortak oyuncusu olan çiftler seçilir —
// "bilinemez" gün olmaz (maç içi matchupSelection ile aynı ilke).
const MIN_ANSWERS = 3;
// Aynı kulüp son N gün içinde tekrar çıkmasın (iki taraftan biri olarak).
const NO_REPEAT_DAYS = 10;

// matchupSelection.ts'teki A_TEAM_ONLY ile aynı amaç: kadın/altyapı/B takımı
// asla günün sorusu olmaz. (Oradaki blok modül-içi; burada tabloya 'c' alias'ı
// ile aynı filtre uygulanır.)
const A_TEAM_FILTER = `
  AND c.name_norm !~* '(women|femen|femin|femmin|frauen|kadin|ladies)'
  AND c.name_norm !~* '(^|[^a-z])(u-?1[2-9]|u-?2[0-3]|sub-?[0-9]|youth|jugend|primavera|juvenil|altyapi|akademi|academy|junior|jeugd)([^a-z]|$)'
  AND c.name_norm !~* '( b| ii| iii| reserves?| castilla)$'
`;

export function istanbulDayIdx(now = Date.now()): number {
  return Math.floor((now + IST_OFFSET_MS) / DAY_MS);
}

export function dayResetAt(dayIdx: number): Date {
  return new Date((dayIdx + 1) * DAY_MS - IST_OFFSET_MS);
}

/** Oyun içinde gösterilen gün numarası — 1'den başlar (lansman: 2026-08-27 IST). */
const LAUNCH_DAY_IDX = istanbulDayIdx(Date.parse('2026-08-27T00:00:00+03:00'));
export function displayDayNumber(dayIdx: number): number {
  return dayIdx - LAUNCH_DAY_IDX + 1;
}

function rngFrom(seedText: string): () => number {
  let counter = 0;
  return () => {
    const h = createHash('sha256').update(`${seedText}:${counter++}`).digest();
    return h.readUInt32BE(0) / 0xffffffff;
  };
}

interface ClubRow { id: number; name: string; logo_url: string | null }

function toClubRef(r: ClubRow): ClubRef {
  return { id: Number(r.id), name: r.name, logoUrl: r.logo_url };
}

/** Günün çiftini getirir; yoksa deterministik seçip yazar (ilk yazan kazanır). */
export async function ensureDailyPair(dayIdx: number): Promise<{ teamA: ClubRef; teamB: ClubRef } | null> {
  const existing = await loadDailyPair(dayIdx);
  if (existing) return existing;

  const rnd = rngFrom(`cof-daily-cx:${dayIdx}`);
  // Son günlerin kulüpleri tekrar etmesin.
  const { rows: recent } = await pool.query<{ team_a_id: number; team_b_id: number }>(
    `SELECT team_a_id, team_b_id FROM daily_crossover_days WHERE day_idx >= $1`,
    [dayIdx - NO_REPEAT_DAYS],
  );
  const used = new Set<number>();
  for (const r of recent) { used.add(Number(r.team_a_id)); used.add(Number(r.team_b_id)); }

  // Tanınırlık kümesi: İKİ taraf da bu listeden gelir — "Sampdoria × Ternana"
  // gibi yarısı obskür günler olmaz (günlük soru herkese sorulur, niş olamaz).
  // Ham popularity kolonu tek başına güvenilmez (Stevenage/Alcorcón sızıyordu):
  // oyunun kendi katman sistemi (clubPopularityTier) süzer — yalnız
  // GLOBAL_GIANT / VERY_POPULAR / POPULAR katmanları günün sorusu olabilir.
  const { rows: rawClubs } = await pool.query<ClubRow & { popularity: string | null }>(
    `SELECT c.id, c.name, c.logo_url, c.popularity::text AS popularity FROM clubs c
      WHERE c.is_national = FALSE AND c.logo_url IS NOT NULL ${A_TEAM_FILTER}
      ORDER BY c.popularity DESC NULLS LAST, c.id
      LIMIT 220`,
  );
  const topClubs = rawClubs.filter((c) => {
    const tier = clubPopularityTier({ name: c.name, popularity: Number(c.popularity ?? 0) });
    return tier === 'GLOBAL_GIANT' || tier === 'VERY_POPULAR' || tier === 'POPULAR';
  });
  const recognizable = new Set(topClubs.map((c) => Number(c.id)));
  const candidatesA = topClubs.filter((c) => !used.has(Number(c.id)));
  const poolA = candidatesA.length >= 10 ? candidatesA : topClubs;
  if (!poolA.length) return null;

  // TÜRK GÜNÜ: her 3. gün soru bir Türk kulübünden açılır (maç içi "Türk turu"
  // garantisinin günlük karşılığı — kitlemizin kalbi burada atıyor).
  const turkishDay = dayIdx % 3 === 0;
  const turkishPool = poolA.filter((c) => isTurkishClub(c.name));
  for (let attempt = 0; attempt < 12; attempt++) {
    const drawPool = turkishDay && turkishPool.length && attempt < 8 ? turkishPool : poolA;
    const teamA = drawPool[Math.floor(rnd() * drawPool.length)]!;
    // Aday B: teamA ile ≥MIN_ANSWERS ortak oyuncusu olan tanınır kulüpler.
    const { rows: partners } = await pool.query<ClubRow & { answer_count: number }>(
      `SELECT c.id, c.name, c.logo_url, COUNT(DISTINCT a.player_id)::int AS answer_count
         FROM player_clubs a
         JOIN player_clubs b ON b.player_id = a.player_id AND b.club_id <> a.club_id
         JOIN clubs c ON c.id = b.club_id
        WHERE a.club_id = $1 AND c.is_national = FALSE AND c.logo_url IS NOT NULL ${A_TEAM_FILTER}
        GROUP BY c.id, c.name, c.logo_url
       HAVING COUNT(DISTINCT a.player_id) >= $2
        ORDER BY c.popularity DESC NULLS LAST, c.id
        LIMIT 40`,
      [teamA.id, MIN_ANSWERS],
    );
    const known = partners.filter((c) => recognizable.has(Number(c.id)));
    if (!known.length) continue; // bu A ile tanınır eş yok — başka A dene
    const freshPartners = known.filter((c) => !used.has(Number(c.id)));
    const poolB = (freshPartners.length ? freshPartners : known).slice(0, 15);
    const teamB = poolB[Math.floor(rnd() * poolB.length)]!;
    await pool.query(
      `INSERT INTO daily_crossover_days (day_idx, team_a_id, team_b_id)
       VALUES ($1, $2, $3) ON CONFLICT (day_idx) DO NOTHING`,
      [dayIdx, teamA.id, teamB.id],
    );
    // Yarışta başka instance yazmış olabilir — kazananı oku.
    return loadDailyPair(dayIdx);
  }
  return null;
}

async function loadDailyPair(dayIdx: number): Promise<{ teamA: ClubRef; teamB: ClubRef } | null> {
  const { rows } = await pool.query<{ a_id: number; a_name: string; a_logo: string | null; b_id: number; b_name: string; b_logo: string | null }>(
    `SELECT a.id AS a_id, a.name AS a_name, a.logo_url AS a_logo,
            b.id AS b_id, b.name AS b_name, b.logo_url AS b_logo
       FROM daily_crossover_days d
       JOIN clubs a ON a.id = d.team_a_id
       JOIN clubs b ON b.id = d.team_b_id
      WHERE d.day_idx = $1`,
    [dayIdx],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    teamA: toClubRef({ id: r.a_id, name: r.a_name, logo_url: r.a_logo }),
    teamB: toClubRef({ id: r.b_id, name: r.b_name, logo_url: r.b_logo }),
  };
}

// Durum şekli protokolde tanımlı (tek kaynak): DailyCrossoverStateView.
export type DailyCxStateView = DailyCrossoverStateView;

interface ResultRow {
  started_at: string;
  finished_at: string | null;
  correct: boolean | null;
  guesses: number;
  duration_ms: number | null;
  answer_player_name: string | null;
  answer_player_image: string | null;
}

async function loadResultRow(userId: string, dayIdx: number): Promise<ResultRow | null> {
  const { rows } = await pool.query<ResultRow>(
    `SELECT started_at, finished_at, correct, guesses, duration_ms, answer_player_name, answer_player_image
       FROM daily_crossover_results WHERE user_id = $1 AND day_idx = $2`,
    [userId, dayIdx],
  );
  return rows[0] ?? null;
}

/** Bugün dahil geriye doğru ardışık DOĞRU gün sayısı. */
export async function dailyStreak(userId: string, dayIdx: number): Promise<number> {
  const { rows } = await pool.query<{ day_idx: number; correct: boolean | null }>(
    `SELECT day_idx, correct FROM daily_crossover_results
      WHERE user_id = $1 AND day_idx > $2 AND correct = TRUE
      ORDER BY day_idx DESC`,
    [userId, dayIdx - 60],
  );
  let streak = 0;
  let expected = dayIdx;
  for (const r of rows) {
    const d = Number(r.day_idx);
    if (d === expected || (streak === 0 && d === dayIdx - 1)) {
      // Bugün henüz oynanmadıysa seri dünden sayılır (kart "serin sürüyor" der).
      streak += 1;
      expected = d - 1;
    } else if (d < expected) {
      break;
    }
  }
  return streak;
}

export async function getDailyState(userId: string, now = Date.now()): Promise<DailyCxStateView | null> {
  const dayIdx = istanbulDayIdx(now);
  const pair = await ensureDailyPair(dayIdx);
  if (!pair) return null;
  const row = userId ? await loadResultRow(userId, dayIdx) : null;
  const finished = !!row?.finished_at;
  return {
    day: displayDayNumber(dayIdx),
    teamA: pair.teamA,
    teamB: pair.teamB,
    resetAt: dayResetAt(dayIdx).toISOString(),
    reward: DAILY_CX_REWARD,
    maxGuesses: MAX_GUESSES,
    attemptsUsed: row?.guesses ?? 0,
    started: !!row,
    played: finished,
    streak: userId ? await dailyStreak(userId, dayIdx) : 0,
    result: finished && row
      ? {
          day: displayDayNumber(dayIdx),
          correct: row.correct === true,
          guesses: row.guesses,
          durationMs: row.duration_ms ?? 0,
          playerName: row.answer_player_name,
          playerImage: row.answer_player_image,
          commonPlayers: await commonPlayersDetailed(pair.teamA.id, pair.teamB.id, 5).then(
            (list) => list.map((p) => ({ name: p.name, imageUrl: p.imageUrl ?? null })),
          ).catch(() => []),
        }
      : null,
  };
}

/** Sayaç başlangıcı: oyuncu soruyu AÇTIĞI an — tahminden değil. Idempotent. */
export async function startDaily(userId: string, now = Date.now()): Promise<void> {
  const dayIdx = istanbulDayIdx(now);
  await pool.query(
    `INSERT INTO daily_crossover_results (user_id, day_idx) VALUES ($1, $2)
     ON CONFLICT (user_id, day_idx) DO NOTHING`,
    [userId, dayIdx],
  );
}

export type DailyGuessOutcome =
  | { kind: 'finished'; state: DailyCxStateView; rewardGranted: number }
  | { kind: 'wrong'; attemptsLeft: number; guess: string; suggestion: string | null }
  | { kind: 'not_active' };

export async function submitDailyGuess(userId: string, text: string, now = Date.now()): Promise<DailyGuessOutcome> {
  const dayIdx = istanbulDayIdx(now);
  const pair = await ensureDailyPair(dayIdx);
  if (!pair || !userId) return { kind: 'not_active' };
  await startDaily(userId, now); // satır yoksa aç (start atlanmış eski istemci)
  const row = await loadResultRow(userId, dayIdx);
  if (!row || row.finished_at) return { kind: 'not_active' };

  let verdict: VerifyResult;
  try {
    verdict = await verifyGuess(pair.teamA.id, pair.teamB.id, text);
  } catch {
    return { kind: 'not_active' };
  }

  // Deneme sayacı atomik artar ve 3'ü aşamaz — çifte gönderim hak yakamaz.
  const { rows: bumped } = await pool.query<{ guesses: number; started_at: string }>(
    `UPDATE daily_crossover_results SET guesses = guesses + 1
      WHERE user_id = $1 AND day_idx = $2 AND finished_at IS NULL AND guesses < $3
      RETURNING guesses, started_at`,
    [userId, dayIdx, MAX_GUESSES],
  );
  const bump = bumped[0];
  if (!bump) return { kind: 'not_active' };
  const guesses = Number(bump.guesses);
  const durationMs = Math.max(0, now - new Date(bump.started_at).getTime());

  if (verdict.correct && verdict.matchedPlayer) {
    await pool.query(
      `UPDATE daily_crossover_results
          SET finished_at = now(), correct = TRUE, duration_ms = $3,
              answer_player_name = $4, answer_player_image = $5
        WHERE user_id = $1 AND day_idx = $2 AND finished_at IS NULL`,
      [userId, dayIdx, durationMs, verdict.matchedPlayer.name, verdict.matchedPlayer.imageUrl],
    );
    // Ödül: atomik + deftere idempotent — aynı gün ikinci kez yazılamaz
    // (finished_at guard'ı zaten ikinci finish'i engeller).
    const { rows: rewarded } = await pool.query<{ diamonds: number }>(
      `UPDATE users SET diamonds = diamonds + $2 WHERE id = $1 RETURNING diamonds`,
      [userId, DAILY_CX_REWARD],
    );
    if (rewarded[0]) {
      void recordDiamondLedger({
        userId, amount: DAILY_CX_REWARD, balanceAfter: Number(rewarded[0].diamonds),
        reason: 'DAILY_CROSSOVER_REWARD', referenceId: String(dayIdx),
        idempotencyKey: `dailycx:${userId}:${dayIdx}`,
      });
    }
    const state = await getDailyState(userId, now);
    return state ? { kind: 'finished', state, rewardGranted: DAILY_CX_REWARD } : { kind: 'not_active' };
  }

  if (guesses >= MAX_GUESSES) {
    await pool.query(
      `UPDATE daily_crossover_results
          SET finished_at = now(), correct = FALSE, duration_ms = $3
        WHERE user_id = $1 AND day_idx = $2 AND finished_at IS NULL`,
      [userId, dayIdx, durationMs],
    );
    const state = await getDailyState(userId, now);
    return state ? { kind: 'finished', state, rewardGranted: 0 } : { kind: 'not_active' };
  }

  // Maç içi kuralla aynı: yanlışın metni rakip yok diye AÇIK dönebilir; öneri
  // ("şunu mu demek istedin") verify'ın kendi mantığından gelir.
  return {
    kind: 'wrong',
    attemptsLeft: MAX_GUESSES - guesses,
    guess: text,
    suggestion: verdict.matchedPlayer?.name ?? null,
  };
}
