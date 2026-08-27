// ============================================================================
// FUTBOL XOX (Tiki-Taka-Toe) — 3×3 grid üreticisi.
//
// KURAL: 9 hücrenin HER BİRİ en az MIN_CELL_ANSWERS geçerli cevaba sahip
// olmalı — imkânsız hücre, turu değil MAÇI kilitler. Üretim deterministik
// değildir ama sunucu-otoriterdir: grid yalnız burada doğar, istemci çizer.
//
// Seçki dili retention kararlarıyla aynı (bkz. retention-first-bots):
// popüler/bilindik kulüpler ağırlıklı, Türk devlerinin gride girme şansı
// yüksek — oyuncu tanıdığı takımlarla oynar.
// ============================================================================
import { pool } from '../db/pool.ts';
import type { ClubRef } from '../protocol.ts';
import { clubPopularityTier, tierBaseWeight, isTurkishClub } from './clubPopularity.ts';

export interface XoxGrid {
  rows: ClubRef[];             // 3 satır kulübü
  cols: ClubRef[];             // 3 sütun kulübü
  /** Satır-major 9 hücre: kaç geçerli ortak oyuncu var (bot zorluğu + telemetri). */
  cellAnswerCounts: number[];
}

function intEnv(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : fallback;
}

export const XOX_MIN_CELL_ANSWERS = intEnv('XOX_MIN_CELL_ANSWERS', 2);
const POOL_LIMIT = 70;
const MAX_ATTEMPTS = 6;

interface PoolClub {
  id: number;
  name: string;
  logoUrl: string | null;
  weight: number;
}

let poolCache: { at: number; clubs: PoolClub[] } | null = null;

/** Popüler kulüp havuzu (5 dk önbellek): bilindik takımlar ağır basar,
 * Türk devleri ekstra çarpanla gride sık girer. */
async function popularClubPool(): Promise<PoolClub[]> {
  if (poolCache && Date.now() - poolCache.at < 5 * 60_000) return poolCache.clubs;
  const { rows } = await pool.query<{ id: string; name: string; name_norm: string; logo_url: string | null; league: string | null; country: string | null; pop: string }>(
    `SELECT c.id, c.name, c.name_norm, c.logo_url, c.league, c.country,
            COALESCE(NULLIF(c.popularity, 0), (SELECT count(*) FROM player_clubs pc WHERE pc.club_id = c.id)) AS pop
       FROM clubs c
      WHERE c.is_national = false
        AND c.logo_url IS NOT NULL
        AND EXISTS (SELECT 1 FROM player_clubs pc WHERE pc.club_id = c.id)
        AND c.name_norm !~* '(women|femen|femin|frauen|kadin|ladies)'
        AND c.name_norm !~* '(^|[^a-z])(u-?1[2-9]|u-?2[0-3]|youth|jugend|primavera|altyapi|akademi|academy|junior)([^a-z]|$)'
        AND c.name_norm !~* '( b| ii| iii| reserves?| castilla)$'
      ORDER BY pop DESC
      LIMIT $1`,
    [POOL_LIMIT],
  );
  const clubs = rows.map((r) => {
    const tier = clubPopularityTier({ name: r.name, nameNorm: r.name_norm, popularity: Number(r.pop), league: r.league, country: r.country });
    let weight = tierBaseWeight(tier);
    if (isTurkishClub(r.name)) weight *= 1.8; // Türk devleri gridde sık görünsün
    return { id: Number(r.id), name: r.name, logoUrl: r.logo_url, weight };
  });
  poolCache = { at: Date.now(), clubs };
  return clubs;
}

function weightedSample(pool: PoolClub[], n: number, rnd: () => number): PoolClub[] {
  const picked: PoolClub[] = [];
  const remaining = [...pool];
  while (picked.length < n && remaining.length) {
    const total = remaining.reduce((s, c) => s + c.weight, 0);
    let roll = rnd() * total;
    let idx = 0;
    for (; idx < remaining.length; idx++) { roll -= remaining[idx]!.weight; if (roll <= 0) break; }
    picked.push(remaining.splice(Math.min(idx, remaining.length - 1), 1)[0]!);
  }
  return picked;
}

/** 3 satır kulübünün HER BİRİYLE ≥min kesişen sütun adayları — tek sorgu. */
async function columnCandidates(rowIds: number[], candidateIds: number[], min: number): Promise<Map<number, [number, number, number]>> {
  const { rows } = await pool.query<{ cid: string; x1: string; x2: string; x3: string }>(
    `SELECT pc2.club_id AS cid,
            count(DISTINCT pc1.player_id) FILTER (WHERE pc1.club_id = $1) AS x1,
            count(DISTINCT pc1.player_id) FILTER (WHERE pc1.club_id = $2) AS x2,
            count(DISTINCT pc1.player_id) FILTER (WHERE pc1.club_id = $3) AS x3
       FROM player_clubs pc1
       JOIN player_clubs pc2 ON pc2.player_id = pc1.player_id AND pc2.club_id <> pc1.club_id
      WHERE pc1.club_id = ANY($4::bigint[])
        AND pc2.club_id = ANY($5::bigint[])
      GROUP BY pc2.club_id`,
    [rowIds[0], rowIds[1], rowIds[2], rowIds, candidateIds],
  );
  const out = new Map<number, [number, number, number]>();
  for (const r of rows) {
    const t: [number, number, number] = [Number(r.x1), Number(r.x2), Number(r.x3)];
    if (t[0] >= min && t[1] >= min && t[2] >= min) out.set(Number(r.cid), t);
  }
  return out;
}

export async function generateXoxGrid(rnd: () => number = Math.random): Promise<XoxGrid | null> {
  const clubs = await popularClubPool();
  if (clubs.length < 10) return null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rowsPick = weightedSample(clubs, 3, rnd);
    const rowIds = rowsPick.map((c) => c.id);
    const candidates = clubs.filter((c) => !rowIds.includes(c.id));
    const ok = await columnCandidates(rowIds, candidates.map((c) => c.id), XOX_MIN_CELL_ANSWERS);
    if (ok.size < 3) continue;
    const colsPick = weightedSample(candidates.filter((c) => ok.has(c.id)), 3, rnd);
    if (colsPick.length < 3) continue;
    const counts: number[] = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) counts.push(ok.get(colsPick[c]!.id)![r]!);
    return {
      rows: rowsPick.map((c) => ({ id: c.id, name: c.name, logoUrl: c.logoUrl })),
      cols: colsPick.map((c) => ({ id: c.id, name: c.name, logoUrl: c.logoUrl })),
      cellAnswerCounts: counts,
    };
  }
  return null;
}

/** Klasik XOX kazanan çizgileri (satır-major hücre indeksleri). */
export const XOX_LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function xoxWinningLine(owners: readonly (string | null)[], playerId: string): number[] | null {
  for (const line of XOX_LINES) {
    if (line.every((i) => owners[i] === playerId)) return [...line];
  }
  return null;
}

export const XOX_TURN_MS = intEnv('XOX_TURN_MS', 20_000);
export const XOX_TURN_CAP = intEnv('XOX_TURN_CAP', 24);
export const XOX_SUDDEN_MS = intEnv('XOX_SUDDEN_MS', 30_000);
