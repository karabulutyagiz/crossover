// ============================================================================
// GÜNÜN KARİYERİ (2026-08-29) — ikinci Wordle döngüsü.
//
// Herkese aynı futbolcu. Kulüp geçmişi yıl sırasıyla TEK TEK açılır:
// başta yalnız ilk kulüp görünür ("2009 Gençlerbirliği"), her yanlış/pas bir
// kulüp daha açar. Az ipuçlu bilmek daha değerlidir — paylaşım kartı bunu
// gösterir, organik büyümenin motoru budur.
//
// YENİ VERİ GEREKTİRMEZ: player_clubs.start_year/end_year zaten Transfermarkt'tan
// geliyor. Bu yüzden en ucuz yeni mod.
//
// Günün Crossover'ı ile AYNI kurallar: İstanbul gün sınırı, sunucu-otoriter ve
// deterministik seçim (ilk yazan kazanır), oyuncu başına günde tek oynayış,
// doğru bilene idempotent elmas.
// ============================================================================
import { createHash } from 'node:crypto';
import { pool } from '../db/pool.ts';
import { normalize } from './normalize.ts';
import { recordDiamondLedger } from './diamondLedger.ts';
import { getUser, type UserProfile } from './rank.ts';
import { istanbulDayIdx, dayResetAt, displayDayNumber } from './dailyCrossover.ts';
import { log } from '../logger.ts';

export const DAILY_CAREER_REWARD = 10; // 💎 — Günün Crossover'ı ile aynı değer
export const CAREER_MAX_GUESSES = 4;
/** İpucu olarak anlamlı olması için gereken en az kulüp sayısı. */
const MIN_CLUBS = 3;
const MAX_CLUBS_SHOWN = 8;
/** Aynı futbolcu son N gün içinde tekrar çıkmasın. */
const NO_REPEAT_DAYS = 60;

export interface CareerStepView {
  order: number;              // 1'den başlar
  clubName: string;
  clubLogo: string | null;
  years: string;              // "2009–2013" ya da "2015"
  revealed: boolean;          // istemci kilitli kutu mu göstersin
}

export interface DailyCareerStateView {
  day: number;
  resetAt: string;
  reward: number;
  maxGuesses: number;
  attemptsUsed: number;
  revealed: number;           // açılmış kulüp sayısı
  totalSteps: number;
  steps: CareerStepView[];    // açılmamışların adı/logosu BOŞ gelir (sızıntı yok)
  played: boolean;
  correct: boolean;
  answer: { name: string; imageUrl: string | null; nationality: string | null } | null; // yalnız gün kapanınca
}

function rngFrom(seedText: string): () => number {
  let counter = 0;
  return () => {
    const h = createHash('sha256').update(`${seedText}:${counter++}`).digest();
    return h.readUInt32BE(0) / 0xffffffff;
  };
}

/** Günün futbolcusunu getirir; yoksa deterministik seçip yazar. */
async function ensureDailyPlayer(dayIdx: number): Promise<number | null> {
  const existing = await pool.query<{ player_id: string }>(
    `SELECT player_id FROM daily_career_days WHERE day_idx = $1`, [dayIdx],
  );
  if (existing.rows[0]) return Number(existing.rows[0].player_id);

  // Aday havuzu: yeterince kulüp gezmiş, TANINAN futbolcular. Bilinirlik ölçüsü
  // kulüp popülerliği (botCommonPlayersRanked ile aynı proxy) — obskür isim
  // "bilinemez gün" yaratmasın.
  const { rows: recent } = await pool.query<{ player_id: string }>(
    `SELECT player_id FROM daily_career_days WHERE day_idx >= $1`, [dayIdx - NO_REPEAT_DAYS],
  );
  const used = new Set(recent.map((r) => Number(r.player_id)));

  const { rows: candidates } = await pool.query<{ id: string; fame: string }>(
    `SELECT p.id,
            MAX(GREATEST(COALESCE(c.popularity, 0),
                (SELECT count(*) FROM player_clubs x WHERE x.club_id = pc.club_id))) AS fame
       FROM players p
       JOIN player_clubs pc ON pc.player_id = p.id
       JOIN clubs c ON c.id = pc.club_id AND c.is_national = false
      WHERE p.image_url IS NOT NULL
      GROUP BY p.id
     HAVING count(DISTINCT pc.club_id) >= $1
      ORDER BY fame DESC
      LIMIT 400`,
    [MIN_CLUBS],
  );
  const pool400 = candidates.map((c) => Number(c.id)).filter((id) => !used.has(id));
  if (!pool400.length) return null;

  const rnd = rngFrom(`cof-daily-career:${dayIdx}`);
  const pick = pool400[Math.floor(rnd() * pool400.length)]!;
  await pool.query(
    `INSERT INTO daily_career_days (day_idx, player_id) VALUES ($1, $2) ON CONFLICT (day_idx) DO NOTHING`,
    [dayIdx, pick],
  );
  const after = await pool.query<{ player_id: string }>(
    `SELECT player_id FROM daily_career_days WHERE day_idx = $1`, [dayIdx],
  );
  return after.rows[0] ? Number(after.rows[0].player_id) : null;
}

interface CareerRow { club_name: string; logo_url: string | null; start_year: number | null; end_year: number | null }

async function careerOf(playerId: number): Promise<CareerRow[]> {
  const { rows } = await pool.query<CareerRow>(
    `SELECT c.name AS club_name, c.logo_url, pc.start_year, pc.end_year
       FROM player_clubs pc
       JOIN clubs c ON c.id = pc.club_id
      WHERE pc.player_id = $1 AND c.is_national = false
      ORDER BY COALESCE(pc.start_year, 9999) ASC, c.name ASC
      LIMIT $2`,
    [playerId, MAX_CLUBS_SHOWN],
  );
  return rows;
}

function yearsLabel(r: CareerRow): string {
  if (r.start_year && r.end_year && r.start_year !== r.end_year) return `${r.start_year}–${r.end_year}`;
  if (r.start_year) return String(r.start_year);
  if (r.end_year) return String(r.end_year);
  return '—';
}

/** Tahmin, futbolcunun adıyla eşleşiyor mu? Tam ad VEYA soyad kabul edilir
 *  (insanlar arama kutusuna soyadı yazar — bot yazımıyla aynı gerçek). */
function nameMatches(guess: string, fullName: string): boolean {
  const g = normalize(guess);
  if (!g) return false;
  const full = normalize(fullName);
  if (g === full) return true;
  const parts = full.split(' ').filter((t) => t.length >= 3);
  if (!parts.length) return false;
  const surname = parts[parts.length - 1]!;
  if (g === surname) return true;
  // "de bruyne", "van dijk" gibi iki parçalı soyadlar.
  if (parts.length >= 2 && g === `${parts[parts.length - 2]} ${surname}`) return true;
  return false;
}

async function loadResult(userId: string, dayIdx: number): Promise<{ guesses: number; revealed: number; correct: boolean; finished: boolean } | null> {
  const { rows } = await pool.query<{ guesses: number; revealed: number; correct: boolean; finished: boolean }>(
    `SELECT guesses, revealed, correct, finished FROM daily_career_results WHERE user_id = $1 AND day_idx = $2`,
    [userId, dayIdx],
  );
  return rows[0] ?? null;
}

async function buildView(userId: string, dayIdx: number): Promise<DailyCareerStateView | null> {
  const playerId = await ensureDailyPlayer(dayIdx);
  if (!playerId) return null;
  const career = await careerOf(playerId);
  if (career.length < MIN_CLUBS) return null;

  const res = await loadResult(userId, dayIdx);
  const revealed = res?.revealed ?? 1;
  const played = res?.finished ?? false;
  // Gün kapandıysa tüm adımlar açılır; aksi halde YALNIZ açılanlar dolu gelir —
  // kapalı adımın adı/logosu tele hiç çıkmaz (istemciden okunamaz).
  const steps: CareerStepView[] = career.map((r, i) => {
    const open = played || i < revealed;
    return {
      order: i + 1,
      clubName: open ? r.club_name : '',
      clubLogo: open ? r.logo_url : null,
      years: open ? yearsLabel(r) : '',
      revealed: open,
    };
  });

  let answer: DailyCareerStateView['answer'] = null;
  if (played) {
    const { rows } = await pool.query<{ name: string; image_url: string | null; nationality: string | null }>(
      `SELECT name, image_url, nationality FROM players WHERE id = $1`, [playerId],
    );
    const p = rows[0];
    if (p) answer = { name: p.name, imageUrl: p.image_url, nationality: p.nationality };
  }

  return {
    day: displayDayNumber(dayIdx),
    resetAt: dayResetAt(dayIdx).toISOString(),
    reward: DAILY_CAREER_REWARD,
    maxGuesses: CAREER_MAX_GUESSES,
    attemptsUsed: res?.guesses ?? 0,
    revealed: played ? career.length : revealed,
    totalSteps: career.length,
    steps,
    played,
    correct: res?.correct ?? false,
    answer,
  };
}

export async function getDailyCareer(userId: string): Promise<DailyCareerStateView | null> {
  return buildView(userId, istanbulDayIdx());
}

/**
 * Tahmini işler. Doğruysa gün kapanır ve elmas yatar; yanlışsa bir kulüp daha
 * açılır. Haklar bitince gün kapanır (cevap gösterilir, ödül yok).
 * Sayaçlar DB'de: uygulamayı yeniden başlatmak hak tazelemez.
 */
export async function guessDailyCareer(
  userId: string,
  guess: string,
): Promise<{ ok: true; state: DailyCareerStateView; correct: boolean; rewardGranted: number; profile?: UserProfile } | { ok: false; error: string }> {
  const dayIdx = istanbulDayIdx();
  const playerId = await ensureDailyPlayer(dayIdx);
  if (!playerId) return { ok: false, error: 'Günün kariyeri hazır değil' };
  const career = await careerOf(playerId);
  if (career.length < MIN_CLUBS) return { ok: false, error: 'Günün kariyeri hazır değil' };

  // Satırı oluştur (yoksa) ve KİLİTLE — çift dokunuş iki hak yakamaz.
  await pool.query(
    `INSERT INTO daily_career_results (user_id, day_idx) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, dayIdx],
  );
  const client = await pool.connect();
  let correct = false;
  let rewardGranted = 0;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ guesses: number; revealed: number; finished: boolean }>(
      `SELECT guesses, revealed, finished FROM daily_career_results
        WHERE user_id = $1 AND day_idx = $2 FOR UPDATE`,
      [userId, dayIdx],
    );
    const cur = rows[0];
    if (!cur) { await client.query('ROLLBACK'); return { ok: false, error: 'Kayıt bulunamadı' }; }
    if (cur.finished) { await client.query('ROLLBACK'); return { ok: false, error: 'Bugünkü hakkın bitti' }; }

    const { rows: pRows } = await client.query<{ name: string }>(`SELECT name FROM players WHERE id = $1`, [playerId]);
    correct = !!pRows[0] && nameMatches(guess, pRows[0].name);
    const guesses = cur.guesses + 1;
    const outOfTries = guesses >= CAREER_MAX_GUESSES;
    const revealed = correct ? career.length : Math.min(career.length, cur.revealed + 1);
    await client.query(
      `UPDATE daily_career_results SET guesses = $3, revealed = $4, correct = $5, finished = $6
        WHERE user_id = $1 AND day_idx = $2`,
      [userId, dayIdx, guesses, revealed, correct, correct || outOfTries],
    );

    if (correct) {
      const upd = await client.query<{ diamonds: number }>(
        `UPDATE users SET diamonds = diamonds + $2 WHERE id = $1 RETURNING diamonds`,
        [userId, DAILY_CAREER_REWARD],
      );
      rewardGranted = DAILY_CAREER_REWARD;
      const balanceAfter = Number(upd.rows[0]?.diamonds ?? 0);
      // Defter tx DIŞINDA (arena/streak ödülleriyle aynı desen) — idempotency
      // anahtarı gün bazlı, aynı gün ikinci kez yazılamaz.
      void recordDiamondLedger({
        userId, amount: DAILY_CAREER_REWARD, balanceAfter,
        reason: 'DAILY_CAREER', referenceId: String(dayIdx),
        idempotencyKey: `daily-career:${dayIdx}:${userId}`,
      });
    }
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    log.error('daily_career_guess_failed', { userId, error: err instanceof Error ? err.message : String(err) });
    return { ok: false, error: 'Bir şeyler ters gitti' };
  } finally {
    client.release();
  }

  const state = await buildView(userId, dayIdx);
  if (!state) return { ok: false, error: 'Durum okunamadı' };
  const profile = rewardGranted > 0 ? (await getUser(userId)) ?? undefined : undefined;
  return { ok: true, state, correct, rewardGranted, profile };
}
