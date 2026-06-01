import { pool } from '../db/pool.ts';
import { config } from '../config.ts';
import { normalize } from './normalize.ts';
import type { Scope } from '../protocol.ts';

// Build a scope WHERE-fragment + push its param. Returns '' for 'all'.
function scopeClause(scope: Scope, params: unknown[]): string {
  if (scope.type === 'league') {
    params.push(scope.value);
    return `AND c.league = $${params.length}`;
  }
  if (scope.type === 'country') {
    params.push(scope.value);
    return `AND c.country = $${params.length}`;
  }
  return '';
}

export interface ClubHit {
  id: number;
  name: string;
  logoUrl: string | null;
}

export interface SpellInfo {
  clubId: number;
  clubName: string;
  logoUrl: string | null;
  startYear: number | null;
  endYear: number | null;
}

export type VerifyReason = 'both' | 'not_both' | 'no_match';

export interface VerifyResult {
  correct: boolean;
  reason: VerifyReason;
  autocorrected: boolean; // true when a typo was auto-corrected to the matched player
  teamA: ClubHit;
  teamB: ClubHit;
  matchedPlayer: { id: number; name: string; sim: number } | null;
  spellsA: SpellInfo[]; // matched player's spell(s) at team A
  spellsB: SpellInfo[]; // matched player's spell(s) at team B
  allClubs: SpellInfo[]; // matched player's full club history (used on a wrong guess)
}

/**
 * Autocomplete / resolution for club names. Excludes national teams.
 *
 * Wikidata often has several entities for "the same" club (the main club, its
 * football section, reserve/B/C teams, women's team, historical duplicates).
 * Only the canonical one accumulates a real squad, so we rank by member count
 * (how many players link to it) — this reliably picks the real club over empty
 * duplicates like "Galatasaray SK" vs "Galatasaray S.K." or "Real Madrid C".
 */
export async function searchClubs(
  query: string,
  scope: Scope = { type: 'all' },
  limit = 8,
): Promise<ClubHit[]> {
  const norm = normalize(query);
  if (!norm) return [];
  const params: unknown[] = [norm];
  const scopeSql = scopeClause(scope, params);
  params.push(limit);
  const limitIdx = params.length;
  const { rows } = await pool.query<{ id: string; name: string; logo_url: string | null }>(
    `SELECT c.id, c.name, c.logo_url,
            similarity(c.name_norm, $1) AS sim,
            (SELECT count(*) FROM player_clubs pc WHERE pc.club_id = c.id) AS members
       FROM clubs c
      WHERE c.is_national = false
        AND (c.name_norm LIKE '%' || $1 || '%' OR c.name_norm % $1)
        ${scopeSql}
      ORDER BY members DESC,
               (c.name_norm = $1) DESC,
               sim DESC,
               length(c.name) ASC
      LIMIT $${limitIdx}`,
    params,
  );
  return rows.map((r) => ({ id: Number(r.id), name: r.name, logoUrl: r.logo_url }));
}

/** A random recognizable (has-logo) club within the scope — used by the bot. */
export async function randomClub(scope: Scope = { type: 'all' }): Promise<ClubHit | null> {
  const params: unknown[] = [];
  // scopeClause references "c."; the query aliases clubs as c.
  const scopeSql = scopeClause(scope, params);
  const { rows } = await pool.query<{ id: string; name: string; logo_url: string | null }>(
    `SELECT c.id, c.name, c.logo_url
       FROM clubs c
      WHERE c.is_national = false
        AND c.logo_url IS NOT NULL
        AND EXISTS (SELECT 1 FROM player_clubs pc WHERE pc.club_id = c.id)
        ${scopeSql}
      ORDER BY random()
      LIMIT 1`,
    params,
  );
  const r = rows[0];
  return r ? { id: Number(r.id), name: r.name, logoUrl: r.logo_url } : null;
}

export interface ScopeOption {
  value: string;
  count: number;
}

/** Available leagues and countries (for the scope picker). */
export async function listScopes(): Promise<{ leagues: ScopeOption[]; countries: ScopeOption[] }> {
  const leagues = await pool.query<{ value: string; count: string }>(
    `SELECT league AS value, count(*) AS count FROM clubs
      WHERE league IS NOT NULL GROUP BY league ORDER BY league`,
  );
  const countries = await pool.query<{ value: string; count: string }>(
    `SELECT country AS value, count(*) AS count FROM clubs
      WHERE country IS NOT NULL GROUP BY country ORDER BY country`,
  );
  return {
    leagues: leagues.rows.map((r) => ({ value: r.value, count: Number(r.count) })),
    countries: countries.rows.map((r) => ({ value: r.value, count: Number(r.count) })),
  };
}

/**
 * Players who played for BOTH teams — used by the practice bot to find a valid
 * answer. Ordered by career length (longer = more recognizable) so the bot
 * tends to name a well-known player. Returns [] when no common player exists.
 */
export async function commonPlayers(
  teamAId: number,
  teamBId: number,
  limit = 6,
): Promise<string[]> {
  const { rows } = await pool.query<{ name: string }>(
    `SELECT p.name
       FROM players p
      WHERE EXISTS (SELECT 1 FROM player_clubs a WHERE a.player_id = p.id AND a.club_id = $1)
        AND EXISTS (SELECT 1 FROM player_clubs b WHERE b.player_id = p.id AND b.club_id = $2)
      ORDER BY (SELECT count(*) FROM player_clubs pc WHERE pc.player_id = p.id) DESC
      LIMIT $3`,
    [teamAId, teamBId, limit],
  );
  return rows.map((r) => r.name);
}

async function getClub(id: number): Promise<ClubHit | null> {
  const { rows } = await pool.query<{ id: string; name: string; logo_url: string | null }>(
    'SELECT id, name, logo_url FROM clubs WHERE id = $1',
    [id],
  );
  const r = rows[0];
  return r ? { id: Number(r.id), name: r.name, logoUrl: r.logo_url } : null;
}

async function getPlayerSpells(playerId: number): Promise<SpellInfo[]> {
  const { rows } = await pool.query<{
    club_id: string;
    club_name: string;
    logo_url: string | null;
    start_year: number | null;
    end_year: number | null;
  }>(
    `SELECT pc.club_id, c.name AS club_name, c.logo_url,
            pc.start_year, pc.end_year
       FROM player_clubs pc
       JOIN clubs c ON c.id = pc.club_id
      WHERE pc.player_id = $1
        AND c.is_national = false
      ORDER BY pc.start_year NULLS LAST`,
    [playerId],
  );
  return rows.map((r) => ({
    clubId: Number(r.club_id),
    clubName: r.club_name,
    logoUrl: r.logo_url,
    startYear: r.start_year,
    endYear: r.end_year,
  }));
}

/**
 * Verify whether `guess` names a player who played for BOTH teams.
 *
 * Matching is fuzzy (pg_trgm) and Turkish/accent-insensitive. Among the players
 * whose name is close enough to the guess (>= threshold), if any played for both
 * teams the guess is correct; otherwise we surface the best-matching player so
 * the UI can show "you meant X — here are X's actual clubs".
 */
export async function verifyGuess(
  teamAId: number,
  teamBId: number,
  guess: string,
): Promise<VerifyResult> {
  const [teamA, teamB] = await Promise.all([getClub(teamAId), getClub(teamBId)]);
  if (!teamA || !teamB) {
    throw new Error('Unknown team id(s)');
  }

  const norm = normalize(guess);
  const empty: Omit<VerifyResult, 'correct' | 'reason' | 'matchedPlayer'> = {
    autocorrected: false,
    teamA,
    teamB,
    spellsA: [],
    spellsB: [],
    allClubs: [],
  };
  if (!norm) {
    return { correct: false, reason: 'no_match', matchedPlayer: null, ...empty };
  }

  // 1) Fuzzy candidates by name. We use word_similarity so that typing just a
  // surname ("Sneijder") matches the full stored name ("Wesley Sneijder"), and
  // misspellings still match. (At prototype scale ~20k players a scan is fine;
  // at full scale we'd add the `<%` trigram operator + index for the coarse net.)
  const { rows: cands } = await pool.query<{ id: string; name: string; sim: number }>(
    `SELECT id, name, word_similarity($1, name_norm) AS sim
       FROM players
      WHERE word_similarity($1, name_norm) >= $2
      ORDER BY sim DESC
      LIMIT 25`,
    [norm, config.verifyMatchThreshold],
  );

  const eligible = cands.map((c) => ({ id: Number(c.id), name: c.name, sim: Number(c.sim) }));

  if (eligible.length === 0) {
    return { correct: false, reason: 'no_match', matchedPlayer: null, ...empty };
  }

  // 2) Which eligible candidates played for both teams?
  const ids = eligible.map((c) => c.id);
  const { rows: membership } = await pool.query<{
    player_id: string;
    in_a: boolean;
    in_b: boolean;
  }>(
    `SELECT player_id,
            bool_or(club_id = $2) AS in_a,
            bool_or(club_id = $3) AS in_b
       FROM player_clubs
      WHERE player_id = ANY($1::bigint[])
      GROUP BY player_id`,
    [ids, teamAId, teamBId],
  );
  const memberBy = new Map<number, { inA: boolean; inB: boolean }>(
    membership.map((m) => [Number(m.player_id), { inA: m.in_a, inB: m.in_b }]),
  );
  const playedBoth = (id: number) => {
    const m = memberBy.get(id);
    return Boolean(m?.inA && m?.inB);
  };

  // Candidates are ordered by similarity descending; the best is index 0.
  let matched = eligible[0]!;
  let correct: boolean;
  let autocorrected = false;

  // Players matched strongly enough to be "the specific name you typed" (covers
  // same-name variants like R9 "Ronaldo" vs "Cristiano Ronaldo").
  const exactCluster = eligible.filter((c) => c.sim >= config.verifyExactThreshold);

  if (exactCluster.length > 0) {
    // You clearly named a specific player → judge them strictly. If any of the
    // same-name players played both, that's who you meant. ("Ronaldinho" has no
    // such variant, so it stays wrong — never auto-corrected to "Ronaldo".)
    const both = exactCluster.find((c) => playedBoth(c.id));
    matched = both ?? exactCluster[0]!;
    correct = Boolean(both);
  } else {
    // Approximate spelling (a typo) → auto-correct to the closest player who
    // actually played BOTH teams, and accept it. No "wrong" for a misspelling.
    const both = eligible.find((c) => playedBoth(c.id));
    if (both) {
      matched = both;
      correct = true;
      autocorrected = true;
    } else {
      correct = false;
    }
  }

  const allClubs = await getPlayerSpells(matched.id);
  const spellsA = allClubs.filter((s) => s.clubId === teamAId);
  const spellsB = allClubs.filter((s) => s.clubId === teamBId);

  return {
    correct,
    reason: correct ? 'both' : 'not_both',
    autocorrected,
    teamA,
    teamB,
    matchedPlayer: { id: matched.id, name: matched.name, sim: matched.sim },
    spellsA,
    spellsB,
    allClubs,
  };
}
