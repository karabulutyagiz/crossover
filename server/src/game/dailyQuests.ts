// ============================================================================
// GÜNLÜK GÖREVLER (2026-08-29) — günlük döngünün tutkalı.
//
// Her gün 3 görev. Oyuncu NORMAL maçlarını oynarken ilerler; ayrı bir mod ya
// da ayrı eşleşme YOKTUR (Haftalık Lig'le aynı ilke: "Hemen Oyna" akışına
// dokunulmaz).
//
// ÖDÜL = XP. Elmas VERİLMEZ — kullanıcı kararıyla seri ödülleri tamamen
// kapatıldı, yeni bir elmas musluğu açmak o kararı arkadan delerdi. XP zaten
// Seviye Yolu üzerinden dengelenmiş ödüle dönüşür.
//
// Görevler deterministik seçilir (gün + kullanıcı): herkes aynı gün farklı
// görev görebilir ama aynı oyuncu için gün boyunca DEĞİŞMEZ. Satırlar ilk
// görüntülemede yazılır; ayrı bir "günü hazırla" işi yoktur.
// ============================================================================
import { createHash } from 'node:crypto';
import { pool } from '../db/pool.ts';
import { istanbulDayIdx, dayResetAt } from './dailyCrossover.ts';
import { applyRawXp } from './level.ts';
import { log } from '../logger.ts';

/** Görev ilerlemesini tetikleyen olaylar (maç kapanışında üretilir). */
export type QuestEvent =
  | { kind: 'match_played'; mode: string; won: boolean }
  | { kind: 'correct_answer'; count: number };

interface QuestDef {
  id: string;
  titleKey: string;      // istemci i18n anahtarı
  targets: number[];     // olası hedefler (deterministik seçilir)
  xp: number;            // tamamlama ödülü
  matches: (e: QuestEvent) => number; // olaydan kaç ilerleme çıkar
}

/** Görev havuzu. Hepsi normal oynayışla ilerler — hiçbiri ekstra iş istemez. */
const QUEST_POOL: QuestDef[] = [
  {
    id: 'play_matches', titleKey: 'quest.playMatches', targets: [3, 5], xp: 60,
    matches: (e) => (e.kind === 'match_played' ? 1 : 0),
  },
  {
    id: 'win_matches', titleKey: 'quest.winMatches', targets: [2, 3], xp: 90,
    matches: (e) => (e.kind === 'match_played' && e.won ? 1 : 0),
  },
  {
    id: 'correct_answers', titleKey: 'quest.correctAnswers', targets: [8, 12], xp: 70,
    matches: (e) => (e.kind === 'correct_answer' ? e.count : 0),
  },
  {
    id: 'play_xox', titleKey: 'quest.playXox', targets: [1, 2], xp: 80,
    matches: (e) => (e.kind === 'match_played' && e.mode === 'xox' ? 1 : 0),
  },
  {
    id: 'win_team_team', titleKey: 'quest.winTeamTeam', targets: [2], xp: 80,
    matches: (e) => (e.kind === 'match_played' && e.won && e.mode === 'team-team' ? 1 : 0),
  },
];

const QUESTS_PER_DAY = 3;

export interface DailyQuestView {
  id: string;
  titleKey: string;
  target: number;
  progress: number;
  xp: number;
  done: boolean;      // hedefe ulaşıldı
  claimed: boolean;   // ödül alındı
}

export interface DailyQuestsView {
  day: number;        // gün indeksi (istemci yalnız değişimi izler)
  resetAt: string;
  quests: DailyQuestView[];
}

/** Gün + kullanıcıya sabitlenmiş rastgelelik. */
function rngFrom(seed: string): () => number {
  let n = 0;
  return () => {
    const h = createHash('sha256').update(`${seed}:${n++}`).digest();
    return h.readUInt32BE(0) / 0xffffffff;
  };
}

/** O günün görev seçimi — DB'den bağımsız, saf ve tekrarlanabilir. */
export function selectQuestsFor(userId: string, dayIdx: number): { def: QuestDef; target: number }[] {
  const rnd = rngFrom(`cof-quests:${userId}:${dayIdx}`);
  const pool = [...QUEST_POOL];
  const picked: { def: QuestDef; target: number }[] = [];
  for (let i = 0; i < QUESTS_PER_DAY && pool.length; i++) {
    const idx = Math.floor(rnd() * pool.length);
    const def = pool.splice(idx, 1)[0]!;
    const target = def.targets[Math.floor(rnd() * def.targets.length)]!;
    picked.push({ def, target });
  }
  return picked;
}

/** Bugünün görevleri + ilerleme. Satırlar yoksa burada yazılır. */
export async function getDailyQuests(userId: string): Promise<DailyQuestsView> {
  const dayIdx = istanbulDayIdx();
  const picked = selectQuestsFor(userId, dayIdx);
  // Eksik satırları tek seferde aç (idempotent).
  for (const { def, target } of picked) {
    await pool.query(
      `INSERT INTO daily_quests (user_id, day_idx, quest_id, target) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, day_idx, quest_id) DO NOTHING`,
      [userId, dayIdx, def.id, target],
    );
  }
  const { rows } = await pool.query<{ quest_id: string; target: number; progress: number; claimed: boolean }>(
    `SELECT quest_id, target, progress, claimed FROM daily_quests WHERE user_id = $1 AND day_idx = $2`,
    [userId, dayIdx],
  );
  const byId = new Map(rows.map((r) => [r.quest_id, r]));
  return {
    day: dayIdx,
    resetAt: dayResetAt(dayIdx).toISOString(),
    quests: picked.map(({ def, target }) => {
      const row = byId.get(def.id);
      const progress = Math.min(row?.progress ?? 0, row?.target ?? target);
      return {
        id: def.id,
        titleKey: def.titleKey,
        target: row?.target ?? target,
        progress,
        xp: def.xp,
        done: progress >= (row?.target ?? target),
        claimed: row?.claimed ?? false,
      };
    }),
  };
}

/**
 * Maç kapanışında çağrılır; o günün görevlerini ilerletir.
 * Fire-and-forget: görev yazımı maç sonucunu asla bozmamalı (kendi hatasını yutar).
 */
export async function recordQuestProgress(userId: string, event: QuestEvent): Promise<void> {
  if (!userId) return;
  const dayIdx = istanbulDayIdx();
  try {
    for (const { def, target } of selectQuestsFor(userId, dayIdx)) {
      const step = def.matches(event);
      if (step <= 0) continue;
      // Satır yoksa aç (oyuncu görev ekranını hiç açmamış olabilir), sonra ilerlet.
      await pool.query(
        `INSERT INTO daily_quests (user_id, day_idx, quest_id, target) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, day_idx, quest_id) DO NOTHING`,
        [userId, dayIdx, def.id, target],
      );
      // Hedefte durdurulur: fazla ilerleme saklamanın anlamı yok.
      await pool.query(
        `UPDATE daily_quests SET progress = LEAST(target, progress + $4)
          WHERE user_id = $1 AND day_idx = $2 AND quest_id = $3 AND NOT claimed`,
        [userId, dayIdx, def.id, step],
      );
    }
  } catch (err) {
    log.warn('quest_progress_failed', { userId, error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Tamamlanan görevin XP'sini verir. Tek UPDATE ile claimed=true yapılır ve
 * yalnız GERÇEKTEN o çağrı işaretlediyse XP yazılır — çift dokunuş iki kez
 * ödül veremez (satır kilidi yerine koşullu güncelleme).
 */
export async function claimQuest(
  userId: string,
  questId: string,
): Promise<{ ok: true; xp: number; quests: DailyQuestsView } | { ok: false; error: string }> {
  const dayIdx = istanbulDayIdx();
  const def = QUEST_POOL.find((q) => q.id === questId);
  if (!def) return { ok: false, error: 'Görev bulunamadı' };
  const claimed = await pool.query(
    `UPDATE daily_quests SET claimed = TRUE
      WHERE user_id = $1 AND day_idx = $2 AND quest_id = $3
        AND NOT claimed AND progress >= target`,
    [userId, dayIdx, questId],
  );
  if (!claimed.rowCount) return { ok: false, error: 'Bu görev henüz tamamlanmadı' };
  await applyRawXp(userId, def.xp).catch((err) => {
    log.warn('quest_xp_failed', { userId, questId, error: err instanceof Error ? err.message : String(err) });
  });
  return { ok: true, xp: def.xp, quests: await getDailyQuests(userId) };
}
