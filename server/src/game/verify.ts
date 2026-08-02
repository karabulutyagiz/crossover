import { pool } from '../db/pool.ts';
import { config } from '../config.ts';
import { normalize } from './normalize.ts';
import { BOT_POOLS } from './botpools.ts';
import type { Scope, PlayerRef } from '../protocol.ts';

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
  matchedPlayer: { id: number; name: string; sim: number; imageUrl: string | null } | null;
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
// Keep only senior men's "A" teams: drop women's sides, youth/age categories,
// and reserve/B teams. Pattern-based on the normalized name (lowercase, accents
// stripped). Reused by both search and random pick.
const A_TEAM_ONLY = `
  AND c.name_norm !~* '(women|femen|femin|femmin|frauen|kadin|ladies)'
  AND c.name_norm !~* '(^|[^a-z])(u-?1[2-9]|u-?2[0-3]|sub-?[0-9]|youth|jugend|primavera|juvenil|altyapi|akademi|academy|junior|jeugd)([^a-z]|$)'
  AND c.name_norm !~* '( b| ii| iii| reserves?| castilla)$'
`;

export async function searchClubs(
  query: string,
  scope: Scope = { type: 'all' },
  limit = 24,
): Promise<ClubHit[]> {
  const norm = normalize(query);
  // Empty query → the most popular teams, so the picker's logo grid opens full
  // (no empty gap) and then filters down as the user types.
  if (!norm) {
    // Well-known "favorite" teams (EASY pool) first, then the rest by popularity.
    // Only when unscoped — a league-scoped picker just uses popularity.
    const favIds = scope.type === 'all' ? (await resolvedPools()).easy : [];
    const p: unknown[] = [favIds];
    const sSql = scopeClause(scope, p);
    p.push(limit);
    const { rows } = await pool.query<{ id: string; name: string; logo_url: string | null }>(
      `SELECT c.id, c.name, c.logo_url
         FROM clubs c
        WHERE c.is_national = false
          AND c.logo_url IS NOT NULL
          AND EXISTS (SELECT 1 FROM player_clubs pc WHERE pc.club_id = c.id)
          ${A_TEAM_ONLY}
          ${sSql}
        ORDER BY array_position($1::bigint[], c.id::bigint) NULLS LAST,
                 COALESCE(NULLIF(c.popularity, 0), (SELECT COUNT(*) FROM player_clubs pc2 WHERE pc2.club_id = c.id)) DESC
        LIMIT $${p.length}`,
      p,
    );
    return rows.map((r) => ({ id: Number(r.id), name: r.name, logoUrl: r.logo_url }));
  }
  const params: unknown[] = [norm];
  const scopeSql = scopeClause(scope, params);
  params.push(limit);
  const limitIdx = params.length;
  // Every club is searchable (incl. lower divisions) as long as it has a logo and
  // players. Rank: exact name, then real-league clubs (over reserves/obscure with
  // no league), then popularity (squad market value) so famous clubs surface first
  // (e.g. "bar" → Barcelona, not "FC Barcelona Atlètic"), then prefix, similarity.
  const { rows } = await pool.query<{ id: string; name: string; logo_url: string | null }>(
    `SELECT c.id, c.name, c.logo_url,
            similarity(c.name_norm, $1) AS sim,
            COALESCE(NULLIF(c.popularity, 0), (SELECT COUNT(*) FROM player_clubs pc2 WHERE pc2.club_id = c.id)) AS members
       FROM clubs c
      WHERE c.is_national = false
        AND c.logo_url IS NOT NULL
        AND EXISTS (SELECT 1 FROM player_clubs pc WHERE pc.club_id = c.id)
        AND (c.name_norm LIKE '%' || $1 || '%' OR c.name_norm % $1)
        ${A_TEAM_ONLY}
        ${scopeSql}
      ORDER BY (c.name_norm = $1) DESC,
               (c.league IS NOT NULL) DESC,
               members DESC,
               (c.name_norm LIKE $1 || '%') DESC,
               sim DESC,
               length(c.name) ASC
      LIMIT $${limitIdx}`,
    params,
  );
  return rows.map((r) => ({ id: Number(r.id), name: r.name, logoUrl: r.logo_url }));
}

// Reference list of known league names — used only for documentation.
// All leagues in the DB are now included in the scope picker automatically.

/**
 * A random club for the bot, chosen by POPULARITY (clubs.popularity = squad
 * market value). Data-driven — no hardcoded ids, no league whitelist — so every
 * famous club is reachable and it survives data rebuilds.
 *
 * Difficulty tiers pick from DISTINCT popularity bands so each level feels
 * noticeably different:
 * - 'easy':   top ~20 mega-famous clubs EVERYONE knows
 *             (Real Madrid, Barcelona, Man City, Bayern, Liverpool, etc.)
 * - 'medium': ranks 21–80 — well-known but not top-tier
 *             (Atalanta, Leipzig, Villarreal, Marseille, Feyenoord, etc.)
 * - 'hard':   ranks 81–250 — recognizable but harder to recall transfers for
 *             (Montpellier, Augsburg, Sassuolo, Kasımpaşa, etc.)
 */
// Minimum name similarity to accept a TYPO auto-correction (below the exact
// threshold but high enough that it's clearly the same name, just misspelled —
// not a loose coincidental overlap).
const AUTOCORRECT_MIN = 0.6;

// ---- Edit-distance fallback for the autocorrect gate ----
// Trigram similarity punishes an inserted/dropped letter near the start of a
// short name far harder than a human would: "pijanic" vs "pjanic" is one edit
// away yet only ~0.5 trigram — below AUTOCORRECT_MIN — while the unrelated
// "tijanic" scores higher. Levenshtein sees through that, so a both-teams
// candidate that trigram rejects gets a second look by edit closeness.
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  const cur = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,          // deletion
        cur[j - 1]! + 1,       // insertion
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1), // substitution
      );
    }
    prev = [...cur];
  }
  return prev[n]!;
}

// Closeness (0..1) of the guess to the full normalized name or any single name
// token — a surname alone must be able to match ("pijanic" → "pjanic" = 0.857).
function editCloseness(guessNorm: string, nameNorm: string): number {
  let best = 0;
  for (const target of [nameNorm, ...nameNorm.split(' ')]) {
    if (!target) continue;
    const d = editDistance(guessNorm, target);
    const r = 1 - d / Math.max(guessNorm.length, target.length);
    if (r > best) best = r;
  }
  return best;
}

// Accept threshold for the edit-closeness fallback. Deliberately JUST above
// "ronaldo"→"rivaldo" (2 edits over 7 = 0.714): famous-name confusions stay
// wrong, while genuine one-letter typos ("pijanic"→"pjanic" = 0.857) pass.
// Guesses shorter than 4 chars never use the fallback (stubs stay rejected).
const EDIT_ACCEPT = 0.72;
const EDIT_MIN_GUESS_LEN = 4;

function editAccepts(guessNorm: string, nameNorm: string): boolean {
  return guessNorm.length >= EDIT_MIN_GUESS_LEN && editCloseness(guessNorm, nameNorm) >= EDIT_ACCEPT;
}

const EASY_TOP = 20;    // top 20 only
const MEDIUM_FROM = 21; // skip the mega-famous
const MEDIUM_TO = 80;
const HARD_FROM = 81;
const HARD_TO = 250;

export async function randomClub(
  scope: Scope = { type: 'all' },
  difficulty: 'easy' | 'medium' | 'hard' = 'hard',
): Promise<ClubHit | null> {
  const params: unknown[] = [];
  const scopeSql = scopeClause(scope, params);
  const base = `
    SELECT c.id, c.name, c.logo_url,
           COALESCE(NULLIF(c.popularity, 0), (SELECT COUNT(*) FROM player_clubs pc2 WHERE pc2.club_id = c.id)) AS pop
      FROM clubs c
     WHERE c.is_national = false
       AND c.logo_url IS NOT NULL
       AND EXISTS (SELECT 1 FROM player_clubs pc WHERE pc.club_id = c.id)
       ${A_TEAM_ONLY}
       ${scopeSql}`;

  let sql: string;
  if (difficulty === 'easy') {
    // Top 20 most popular — everyone knows them
    sql = `SELECT id, name, logo_url FROM (${base} ORDER BY pop DESC LIMIT ${EASY_TOP}) t ORDER BY random() LIMIT 1`;
  } else if (difficulty === 'medium') {
    // Ranks 21–80: skip the super-famous, pick from the well-known middle tier
    sql = `SELECT id, name, logo_url FROM (
      SELECT id, name, logo_url, ROW_NUMBER() OVER (ORDER BY pop DESC) AS rn
      FROM (${base}) sub
    ) ranked WHERE rn BETWEEN ${MEDIUM_FROM} AND ${MEDIUM_TO} ORDER BY random() LIMIT 1`;
  } else {
    // Ranks 81–250: less well-known but still have logos and data
    sql = `SELECT id, name, logo_url FROM (
      SELECT id, name, logo_url, ROW_NUMBER() OVER (ORDER BY pop DESC) AS rn
      FROM (${base}) sub
    ) ranked WHERE rn BETWEEN ${HARD_FROM} AND ${HARD_TO} ORDER BY random() LIMIT 1`;
  }

  const { rows } = await pool.query<{ id: string; name: string; logo_url: string | null }>(sql, params);
  const r = rows[0];
  return r ? { id: Number(r.id), name: r.name, logoUrl: r.logo_url } : null;
}

// Resolve the fixed difficulty pools to club ids once (cached for the process).
let cachedPools: Record<'easy' | 'medium' | 'hard', number[]> | null = null;
async function resolvedPools(): Promise<Record<'easy' | 'medium' | 'hard', number[]>> {
  if (cachedPools) return cachedPools;
  const out: Record<'easy' | 'medium' | 'hard', number[]> = { easy: [], medium: [], hard: [] };
  for (const level of ['easy', 'medium', 'hard'] as const) {
    for (const t of BOT_POOLS[level]) {
      const { rows } = await pool.query<{ id: string }>(
        `SELECT c.id FROM clubs c
          WHERE c.is_national = false AND c.logo_url IS NOT NULL
            AND EXISTS (SELECT 1 FROM player_clubs pc WHERE pc.club_id = c.id)
            AND c.name_norm NOT LIKE '%u21%' AND c.name_norm NOT LIKE '%u23%' AND c.name_norm NOT LIKE '% b'
            AND (c.name_norm = $1 OR c.name_norm % $1 OR c.name_norm LIKE '%' || $1 || '%')
          ORDER BY (c.name_norm = $1) DESC, (c.league IS NOT NULL) DESC, similarity(c.name_norm, $1) DESC,
                   (SELECT COUNT(*) FROM player_clubs pc2 WHERE pc2.club_id = c.id) DESC, length(c.name) ASC
          LIMIT 1`,
        [normalize(t.q)],
      );
      if (rows[0]) out[level].push(Number(rows[0].id));
    }
  }
  cachedPools = out;
  return out;
}

// Pick the bot's team from its fixed difficulty pool, preferring a team that
// crosses over with the player's chosen team and isn't in the recent-picks list.
export async function botPickFromPool(
  difficulty: 'easy' | 'medium' | 'hard',
  playerTeamId: number | null,
  excludeIds: number[] = [],
): Promise<ClubHit | null> {
  const pools = await resolvedPools();
  const poolIds = pools[difficulty];
  if (!poolIds.length) return null;
  let cands = poolIds.filter((id) => !excludeIds.includes(id));
  if (!cands.length) cands = poolIds;
  if (playerTeamId != null) {
    const { rows } = await pool.query<{ cid: string }>(
      `SELECT DISTINCT pc2.club_id AS cid FROM player_clubs pc1
         JOIN player_clubs pc2 ON pc2.player_id = pc1.player_id
        WHERE pc1.club_id = $1 AND pc2.club_id = ANY($2)`,
      [playerTeamId, cands],
    );
    const cross = rows.map((r) => Number(r.cid));
    if (cross.length) cands = cross;
  }
  const id = cands[Math.floor(Math.random() * cands.length)]!;
  const { rows } = await pool.query<{ id: string; name: string; logo_url: string | null }>(
    `SELECT id, name, logo_url FROM clubs WHERE id = $1`, [id],
  );
  const r = rows[0];
  return r ? { id: Number(r.id), name: r.name, logoUrl: r.logo_url } : null;
}

export interface ScopeOption {
  value: string;
  displayName?: string;
  count: number;
  logoUrl?: string | null;
}

// API-Football league IDs for logo URLs.
const LEAGUE_LOGOS: Record<string, number> = {
  'Premier League': 39, Championship: 40, 'La Liga': 140, LaLiga: 140, 'La Liga 2': 141,
  'Serie A': 135, 'Serie B': 136, Bundesliga: 78, 'Bundesliga 2': 79,
  'Ligue 1': 61, 'Ligue 2': 62, Eredivisie: 88, 'Primeira Liga': 94, 'Liga Portugal': 94,
  'Süper Lig': 203, 'TFF 1. Lig': 204, 'Belgian Pro League': 144,
  'Scottish Premiership': 179, 'Swiss Super League': 207, 'Austrian Bundesliga': 218,
  'Greek Super League': 197, 'Russian Premier League': 235, 'Ukrainian Premier League': 333,
  MLS: 253, 'Liga MX': 262, 'Brazil Serie A': 71, 'Brazil Serie B': 72,
  'Argentine Liga Profesional': 128, 'Saudi Pro League': 307, 'League One': 41,
  'League Two': 42, 'Scottish Championship': 180, 'Liga Portugal 2': 95,
  'Danish Superliga': 119, Eliteserien: 103, Allsvenskan: 113, Ekstraklasa: 106,
  'Czech First League': 345, 'Croatian HNL': 210, 'Serbian SuperLiga': 286,
  'Romanian Liga I': 283, 'Colombian Primera A': 239, 'Chilean Primera': 265,
  'Uruguayan Primera': 270, 'J1 League': 98, 'K League 1': 292,
  'Chinese Super League': 169, 'A-League': 188, 'Egyptian Premier League': 233,
  'Qatar Stars League': 305, 'UAE Pro League': 301,
};

function leagueLogoUrl(name: string): string | null {
  const id = LEAGUE_LOGOS[name];
  return id ? `https://media.api-sports.io/football/leagues/${id}.png` : null;
}

// ISO 3166-1 alpha-2 country code → flag emoji conversion.
const COUNTRY_FLAGS: Record<string, string> = {
  TR: '🇹🇷', EN: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', ES: '🇪🇸', IT: '🇮🇹', DE: '🇩🇪', FR: '🇫🇷', PT: '🇵🇹',
  NL: '🇳🇱', BE: '🇧🇪', Scotland: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', CH: '🇨🇭', AT: '🇦🇹', GR: '🇬🇷',
  RU: '🇷🇺', UA: '🇺🇦', US: '🇺🇸', MX: '🇲🇽', BR: '🇧🇷', AR: '🇦🇷',
  SA: '🇸🇦', DK: '🇩🇰', NO: '🇳🇴', SE: '🇸🇪', PL: '🇵🇱', CZ: '🇨🇿',
  HR: '🇭🇷', RS: '🇷🇸', RO: '🇷🇴', CO: '🇨🇴', CL: '🇨🇱', UY: '🇺🇾',
  JP: '🇯🇵', KR: '🇰🇷', CN: '🇨🇳', AU: '🇦🇺', EG: '🇪🇬', QA: '🇶🇦', AE: '🇦🇪',
  // Full country names (as stored in DB from API-Football)
  Turkey: '🇹🇷', England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', Spain: '🇪🇸', Italy: '🇮🇹', Germany: '🇩🇪',
  France: '🇫🇷', Portugal: '🇵🇹', Netherlands: '🇳🇱', Belgium: '🇧🇪', Switzerland: '🇨🇭',
  Austria: '🇦🇹', Greece: '🇬🇷', Russia: '🇷🇺', Ukraine: '🇺🇦', USA: '🇺🇸',
  Mexico: '🇲🇽', Brazil: '🇧🇷', Argentina: '🇦🇷', 'Saudi-Arabia': '🇸🇦',
  'Saudi Arabia': '🇸🇦', Denmark: '🇩🇰', Norway: '🇳🇴', Sweden: '🇸🇪',
  Poland: '🇵🇱', 'Czech-Republic': '🇨🇿', Croatia: '🇭🇷', Serbia: '🇷🇸',
  Romania: '🇷🇴', Colombia: '🇨🇴', Chile: '🇨🇱', Uruguay: '🇺🇾',
  Japan: '🇯🇵', 'Korea-South': '🇰🇷', 'South-Korea': '🇰🇷', China: '🇨🇳',
  Australia: '🇦🇺', Egypt: '🇪🇬', Qatar: '🇶🇦', 'United-Arab-Emirates': '🇦🇪',
  Ireland: '🇮🇪', Wales: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'Northern-Ireland': '🇬🇧',
  Hungary: '🇭🇺', Bulgaria: '🇧🇬', Slovakia: '🇸🇰', Slovenia: '🇸🇮',
  Finland: '🇫🇮', Iceland: '🇮🇸', Paraguay: '🇵🇾', Peru: '🇵🇪',
  Ecuador: '🇪🇨', Venezuela: '🇻🇪', Bolivia: '🇧🇴',
  Canada: '🇨🇦', CA: '🇨🇦', 'New-Zealand': '🇳🇿', 'New Zealand': '🇳🇿', NZ: '🇳🇿',
};

function countryFlag(name: string): string | null {
  return COUNTRY_FLAGS[name] ?? null;
}

const COUNTRY_NAME_TR: Record<string, string> = {
  Turkey: 'Türkiye', England: 'İngiltere', Spain: 'İspanya', Italy: 'İtalya',
  Germany: 'Almanya', France: 'Fransa', Portugal: 'Portekiz', Netherlands: 'Hollanda',
  Belgium: 'Belçika', Scotland: 'İskoçya', Switzerland: 'İsviçre', Austria: 'Avusturya',
  Greece: 'Yunanistan', Russia: 'Rusya', Ukraine: 'Ukrayna', USA: 'ABD',
  Mexico: 'Meksika', Brazil: 'Brezilya', Argentina: 'Arjantin',
  'Saudi-Arabia': 'Suudi Arabistan', 'Saudi Arabia': 'Suudi Arabistan',
  Denmark: 'Danimarka', Norway: 'Norveç', Sweden: 'İsveç', Poland: 'Polonya',
  'Czech-Republic': 'Çekya', Croatia: 'Hırvatistan', Serbia: 'Sırbistan',
  Romania: 'Romanya', Colombia: 'Kolombiya', Chile: 'Şili', Uruguay: 'Uruguay',
  Japan: 'Japonya', 'Korea-South': 'Güney Kore', 'South-Korea': 'Güney Kore',
  China: 'Çin', Australia: 'Avustralya', Egypt: 'Mısır', Qatar: 'Katar',
  'United-Arab-Emirates': 'BAE', Ireland: 'İrlanda', Wales: 'Galler',
  'Northern-Ireland': 'Kuzey İrlanda', Hungary: 'Macaristan', Bulgaria: 'Bulgaristan',
  Slovakia: 'Slovakya', Slovenia: 'Slovenya', Finland: 'Finlandiya', Iceland: 'İzlanda',
  Paraguay: 'Paraguay', Peru: 'Peru', Ecuador: 'Ekvador', Venezuela: 'Venezuela',
  Bolivia: 'Bolivya', Canada: 'Kanada', 'New-Zealand': 'Yeni Zelanda',
  'New Zealand': 'Yeni Zelanda',
};

/** Available leagues and countries (for the scope picker). All leagues in the DB. */
export async function listScopes(): Promise<{ leagues: ScopeOption[]; countries: ScopeOption[] }> {
  const leagues = await pool.query<{ value: string; count: string }>(
    `SELECT league AS value, count(*) AS count FROM clubs
      WHERE league IS NOT NULL
      GROUP BY league ORDER BY count(*) DESC, league`,
  );
  const countries = await pool.query<{ value: string; count: string }>(
    `SELECT country AS value, count(*) AS count FROM clubs
      WHERE country IS NOT NULL AND league IS NOT NULL
      GROUP BY country ORDER BY count(*) DESC, country`,
  );
  return {
    leagues: leagues.rows.map((r) => ({
      value: r.value,
      count: Number(r.count),
      logoUrl: leagueLogoUrl(r.value),
    })),
    countries: countries.rows.map((r) => ({
      value: r.value,
      displayName: COUNTRY_NAME_TR[r.value] ?? r.value,
      count: Number(r.count),
      logoUrl: countryFlag(r.value),
    })),
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
      ORDER BY (p.image_url IS NOT NULL) DESC,
               (SELECT count(*) FROM player_clubs pc WHERE pc.player_id = p.id) DESC
      LIMIT $3`,
    [teamAId, teamBId, limit],
  );
  return rows.map((r) => r.name);
}

// Common players ranked by "fame" (the player-count of their biggest club — a
// stand-in for recognizability). The bot uses this to decide whether it would
// realistically know the answer at a given difficulty.
export async function botCommonPlayersRanked(
  teamAId: number,
  teamBId: number,
  limit = 8,
): Promise<{ name: string; fame: number }[]> {
  const { rows } = await pool.query<{ name: string; fame: string }>(
    `WITH cp AS (SELECT club_id, COUNT(*) AS pop FROM player_clubs GROUP BY club_id)
     SELECT p.name, COALESCE(MAX(cp.pop), 0) AS fame
       FROM players p
       JOIN player_clubs a ON a.player_id = p.id AND a.club_id = $1
       JOIN player_clubs b ON b.player_id = p.id AND b.club_id = $2
       JOIN player_clubs s ON s.player_id = p.id
       JOIN cp ON cp.club_id = s.club_id
      GROUP BY p.id, p.name
      ORDER BY fame DESC
      LIMIT $3`,
    [teamAId, teamBId, limit],
  );
  return rows.map((r) => ({ name: r.name, fame: Number(r.fame) }));
}

export interface CommonPlayerInfo {
  name: string;
  imageUrl: string | null;
}

/** Players who played for BOTH teams — with photo URLs for display. */
export async function commonPlayersDetailed(
  teamAId: number,
  teamBId: number,
  limit = 5,
): Promise<CommonPlayerInfo[]> {
  const { rows } = await pool.query<{ name: string; image_url: string | null }>(
    `SELECT p.name, p.image_url
       FROM players p
      WHERE EXISTS (SELECT 1 FROM player_clubs a WHERE a.player_id = p.id AND a.club_id = $1)
        AND EXISTS (SELECT 1 FROM player_clubs b WHERE b.player_id = p.id AND b.club_id = $2)
      ORDER BY (p.image_url IS NOT NULL) DESC,
               (SELECT count(*) FROM player_clubs pc WHERE pc.player_id = p.id) DESC
      LIMIT $3`,
    [teamAId, teamBId, limit],
  );
  return rows.map((r) => ({ name: r.name, imageUrl: r.image_url }));
}

// ---- Country-Team & Letter-Team helpers ----

/** Players who played for the club AND have the given nationality. */
export async function commonPlayersCountryTeam(
  clubId: number,
  country: string,
  limit = 5,
): Promise<CommonPlayerInfo[]> {
  const { rows } = await pool.query<{ name: string; image_url: string | null }>(
    `SELECT p.name, p.image_url
       FROM players p
       JOIN player_clubs pc ON pc.player_id = p.id
      WHERE pc.club_id = $1 AND p.nationality = $2
      ORDER BY (p.image_url IS NOT NULL) DESC,
               (SELECT count(*) FROM player_clubs c WHERE c.player_id = p.id) DESC
      LIMIT $3`,
    [clubId, country, limit],
  );
  return rows.map((r) => ({ name: r.name, imageUrl: r.image_url }));
}

/** Players who played for the club AND any WORD of whose name starts with the
 *  letter (ad YA DA soyad — "L" hem Lukaku'yu hem Lionel'i kabul eder). */
export async function commonPlayersLetterTeam(
  clubId: number,
  letter: string,
  limit = 5,
): Promise<CommonPlayerInfo[]> {
  const prefix = letter.toLowerCase();
  const { rows } = await pool.query<{ name: string; image_url: string | null }>(
    `SELECT p.name, p.image_url
       FROM players p
       JOIN player_clubs pc ON pc.player_id = p.id
      WHERE pc.club_id = $1 AND (p.name_norm LIKE $2 || '%' OR p.name_norm LIKE '% ' || $2 || '%')
      ORDER BY (p.image_url IS NOT NULL) DESC,
               (SELECT count(*) FROM player_clubs c WHERE c.player_id = p.id) DESC
      LIMIT $3`,
    [clubId, prefix, limit],
  );
  return rows.map((r) => ({ name: r.name, imageUrl: r.image_url }));
}

/** Are there any valid players for a country-team combination? */
export async function hasPlayersCountryTeam(clubId: number, country: string): Promise<boolean> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM players p
       JOIN player_clubs pc ON pc.player_id = p.id
      WHERE pc.club_id = $1 AND p.nationality = $2
      LIMIT 1`,
    [clubId, country],
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

// Bot'un ülke-takım seçimini VERİ-GÜDÜMLÜ yapan yardımcılar: bot, karşı tarafın
// seçtiğine göre GARANTİLİ oynanabilir (ortak oyuncusu olan) bir eş seçer; böylece
// "oyuncu var ama tur atlandı" hatası asla olmaz. Milliyet değerleri DB'deki gerçek
// p.nationality string'leridir (İngilizce/Türkçe karışık — ör. Türkiye), asla
// uydurma bir sabit değil.

/** Verilen takımda oynamış oyuncusu OLAN bir milliyet döndürür (yoksa popüler bir gerçek milliyet). */
export async function pickCountryForClub(clubId: number | null, excludeLower: string[] = []): Promise<string> {
  const excl = excludeLower.length ? excludeLower : [];
  if (clubId != null) {
    const { rows } = await pool.query<{ nationality: string }>(
      `SELECT p.nationality FROM player_clubs pc
         JOIN players p ON p.id = pc.player_id
        WHERE pc.club_id = $1 AND p.nationality IS NOT NULL AND lower(p.nationality) <> ALL($2::text[])
        GROUP BY p.nationality
        ORDER BY random() LIMIT 1`,
      [clubId, excl],
    );
    if (rows[0]) return rows[0].nationality;
  }
  // Takım bilinmiyorsa (nadir: her iki taraf da idle) — yeterince oyuncusu olan popüler bir milliyet
  const { rows } = await pool.query<{ nationality: string }>(
    `SELECT nationality FROM players
      WHERE nationality IS NOT NULL AND lower(nationality) <> ALL($1::text[])
      GROUP BY nationality ORDER BY count(DISTINCT id) DESC LIMIT 12`,
    [excl],
  );
  const cands = rows.map((r) => r.nationality);
  return cands[Math.floor(Math.random() * cands.length)] ?? 'Türkiye';
}

/** Verilen milliyetten oyuncusu OLAN bir kulüp döndürür (yoksa null). */
export async function pickClubForCountry(country: string, excludeIds: number[] = []): Promise<ClubHit | null> {
  const excl = excludeIds.length ? excludeIds : [-1];
  const { rows } = await pool.query<{ id: string; name: string; logo_url: string | null }>(
    `SELECT c.id, c.name, c.logo_url FROM clubs c
       JOIN player_clubs pc ON pc.club_id = c.id
       JOIN players p ON p.id = pc.player_id
      WHERE p.nationality = $1 AND c.is_national = false AND c.id <> ALL($2::bigint[])
      GROUP BY c.id, c.name, c.logo_url
      ORDER BY random() LIMIT 1`,
    [country, excl],
  );
  const r = rows[0];
  return r ? { id: Number(r.id), name: r.name, logoUrl: r.logo_url } : null;
}

/** Are there any valid players for a letter-team combination? */
export async function hasPlayersLetterTeam(clubId: number, letter: string): Promise<boolean> {
  const prefix = letter.toLowerCase();
  const { rows } = await pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM players p
       JOIN player_clubs pc ON pc.player_id = p.id
      WHERE pc.club_id = $1 AND (p.name_norm LIKE $2 || '%' OR p.name_norm LIKE '% ' || $2 || '%')
      LIMIT 1`,
    [clubId, prefix],
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/**
 * Verify a guess in country-team mode: the player must have played for the club
 * AND be of the given nationality.
 */
export async function verifyCountryTeamGuess(
  clubId: number,
  country: string,
  guess: string,
): Promise<VerifyResult> {
  const club = await getClub(clubId);
  if (!club) throw new Error('Unknown club id');

  const pseudoCountry: ClubHit = { id: 0, name: country, logoUrl: null };
  const norm = normalize(guess);
  const empty: Omit<VerifyResult, 'correct' | 'reason' | 'matchedPlayer'> = {
    autocorrected: false,
    teamA: pseudoCountry,
    teamB: club,
    spellsA: [],
    spellsB: [],
    allClubs: [],
  };
  if (!norm) return { correct: false, reason: 'no_match', matchedPlayer: null, ...empty };

  // Fuzzy candidates among players who played for the club AND have the nationality
  const { rows: cands } = await pool.query<{ id: string; name: string; sim: number; image_url: string | null }>(
    `SELECT p.id, p.name, p.image_url, word_similarity($1, p.name_norm) AS sim
       FROM players p
       JOIN player_clubs pc ON pc.player_id = p.id
      WHERE pc.club_id = $2
        AND p.nationality = $3
        AND word_similarity($1, p.name_norm) >= $4
      ORDER BY sim DESC,
               (p.image_url IS NOT NULL) DESC,
               (SELECT count(*) FROM player_clubs c WHERE c.player_id = p.id) DESC
      LIMIT 15`,
    [norm, clubId, country, config.verifyMatchThreshold],
  );

  const eligible = cands.map((c) => ({ id: Number(c.id), name: c.name, sim: Number(c.sim), imageUrl: c.image_url }));
  if (eligible.length === 0) {
    return { correct: false, reason: 'no_match', matchedPlayer: null, ...empty };
  }

  let matched = eligible[0]!;
  let correct: boolean;
  let autocorrected = false;

  const exactCluster = eligible.filter((c) => c.sim >= config.verifyExactThreshold);
  if (exactCluster.length > 0) {
    matched = exactCluster[0]!;
    correct = true;
  } else if (eligible[0]!.sim >= AUTOCORRECT_MIN || editAccepts(norm, normalize(eligible[0]!.name))) {
    // close typo of a valid answer (trigram OR edit-distance close) → accept
    matched = eligible[0]!;
    correct = true;
    autocorrected = true;
  } else {
    // loose/garbage match → not accepted
    matched = eligible[0]!;
    correct = false;
  }

  const allClubs = await getPlayerSpells(matched.id);
  const spellsB = allClubs.filter((s) => s.clubId === clubId);

  return {
    correct,
    reason: correct ? 'both' : 'not_both',
    autocorrected,
    teamA: pseudoCountry,
    teamB: club,
    matchedPlayer: { id: matched.id, name: matched.name, sim: matched.sim, imageUrl: matched.imageUrl },
    spellsA: [],
    spellsB,
    allClubs,
  };
}

/**
 * Verify a guess in letter-team mode: the player must have played for the club
 * AND their normalized name must start with the given letter.
 */
export async function verifyLetterTeamGuess(
  clubId: number,
  letter: string,
  guess: string,
): Promise<VerifyResult> {
  const club = await getClub(clubId);
  if (!club) throw new Error('Unknown club id');

  const prefix = letter.toLowerCase();
  const pseudoLetter: ClubHit = { id: 0, name: letter.toUpperCase(), logoUrl: null };
  const norm = normalize(guess);
  const empty: Omit<VerifyResult, 'correct' | 'reason' | 'matchedPlayer'> = {
    autocorrected: false,
    teamA: pseudoLetter,
    teamB: club,
    spellsA: [],
    spellsB: [],
    allClubs: [],
  };
  if (!norm) return { correct: false, reason: 'no_match', matchedPlayer: null, ...empty };

  // Fuzzy candidates among players who played for the club AND any WORD of whose
  // name starts with the letter — soyadı harfle başlayan da geçerli ("L" → Romelu Lukaku)
  const { rows: cands } = await pool.query<{ id: string; name: string; sim: number; image_url: string | null }>(
    `SELECT p.id, p.name, p.image_url, word_similarity($1, p.name_norm) AS sim
       FROM players p
       JOIN player_clubs pc ON pc.player_id = p.id
      WHERE pc.club_id = $2
        AND (p.name_norm LIKE $3 || '%' OR p.name_norm LIKE '% ' || $3 || '%')
        AND word_similarity($1, p.name_norm) >= $4
      ORDER BY sim DESC,
               (p.image_url IS NOT NULL) DESC,
               (SELECT count(*) FROM player_clubs c WHERE c.player_id = p.id) DESC
      LIMIT 15`,
    [norm, clubId, prefix, config.verifyMatchThreshold],
  );

  const eligible = cands.map((c) => ({ id: Number(c.id), name: c.name, sim: Number(c.sim), imageUrl: c.image_url }));
  if (eligible.length === 0) {
    return { correct: false, reason: 'no_match', matchedPlayer: null, ...empty };
  }

  let matched = eligible[0]!;
  let correct: boolean;
  let autocorrected = false;

  const exactCluster = eligible.filter((c) => c.sim >= config.verifyExactThreshold);
  if (exactCluster.length > 0) {
    matched = exactCluster[0]!;
    correct = true;
  } else {
    matched = eligible[0]!;
    // Only autocorrect genuine typos — NOT a bare prefix like "c"/"cri". You picked the
    // letter, so a single letter (or tiny stub) sharing it must not win the round.
    // Closeness = trigram OR edit-distance; the length guards stay for both paths.
    const matchedNorm = normalize(matched.name);
    if ((matched.sim >= AUTOCORRECT_MIN || editAccepts(norm, matchedNorm)) && norm.length >= 4 && norm.length >= matchedNorm.length * 0.5) {
      correct = true;
      autocorrected = true;
    } else {
      return { correct: false, reason: 'no_match', matchedPlayer: null, ...empty };
    }
  }

  const allClubs = await getPlayerSpells(matched.id);
  const spellsB = allClubs.filter((s) => s.clubId === clubId);

  return {
    correct,
    reason: 'both',
    autocorrected,
    teamA: pseudoLetter,
    teamB: club,
    matchedPlayer: { id: matched.id, name: matched.name, sim: matched.sim, imageUrl: matched.imageUrl },
    spellsA: [],
    spellsB,
    allClubs,
  };
}

/** Available nationalities for the country picker (countries with enough players). */
export async function listNationalities(minPlayers = 10): Promise<{ value: string; count: number }[]> {
  const { rows } = await pool.query<{ nationality: string; count: string }>(
    `SELECT p.nationality, count(DISTINCT p.id) AS count
       FROM players p
       JOIN player_clubs pc ON pc.player_id = p.id
      WHERE p.nationality IS NOT NULL
      GROUP BY p.nationality
     HAVING count(DISTINCT p.id) >= $1
      ORDER BY count DESC`,
    [minPlayers],
  );
  return rows.map((r) => ({ value: r.nationality, count: Number(r.count) }));
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

  // 1) Fuzzy candidates by name. word_similarity lets "Sneijder" match
  // "Wesley Sneijder". When similarity scores are equal, prefer the most
  // notable player (more clubs = bigger career, has photo = Wikipedia-notable).
  const { rows: cands } = await pool.query<{ id: string; name: string; name_norm: string; sim: number; image_url: string | null }>(
    `SELECT p.id, p.name, p.name_norm, p.image_url, word_similarity($1, p.name_norm) AS sim
       FROM players p
      WHERE word_similarity($1, p.name_norm) >= $2
      ORDER BY sim DESC,
               (p.image_url IS NOT NULL) DESC,
               (SELECT count(*) FROM player_clubs pc WHERE pc.player_id = p.id) DESC
      LIMIT 25`,
    [norm, config.verifyMatchThreshold],
  );

  const eligible = cands.map((c) => ({ id: Number(c.id), name: c.name, nameNorm: c.name_norm, sim: Number(c.sim), imageUrl: c.image_url }));

  if (eligible.length === 0) {
    return { correct: false, reason: 'no_match', matchedPlayer: null, ...empty };
  }

  // 2) Which eligible candidates played for both teams — and how famous is each?
  // fame piggybacks on the membership scan (≤25 ids): the candidate's biggest
  // club, by market value where filled, else by squad size — the same
  // recognizability proxy botCommonPlayersRanked uses.
  const ids = eligible.map((c) => c.id);
  const { rows: membership } = await pool.query<{
    player_id: string;
    in_a: boolean;
    in_b: boolean;
    fame: string;
  }>(
    `SELECT pc.player_id,
            bool_or(pc.club_id = $2) AS in_a,
            bool_or(pc.club_id = $3) AS in_b,
            MAX(GREATEST(COALESCE(c.popularity, 0),
                         (SELECT count(*) FROM player_clubs x WHERE x.club_id = pc.club_id))) AS fame
       FROM player_clubs pc
       JOIN clubs c ON c.id = pc.club_id
      WHERE pc.player_id = ANY($1::bigint[])
      GROUP BY pc.player_id`,
    [ids, teamAId, teamBId],
  );
  const memberBy = new Map<number, { inA: boolean; inB: boolean; fame: number }>(
    membership.map((m) => [Number(m.player_id), { inA: m.in_a, inB: m.in_b, fame: Number(m.fame) }]),
  );
  const playedBoth = (id: number) => {
    const m = memberBy.get(id);
    return Boolean(m?.inA && m?.inB);
  };
  const fameOf = (id: number) => memberBy.get(id)?.fame ?? 0;
  type Cand = (typeof eligible)[number];
  const mostFamous = (cs: Cand[]): Cand => cs.reduce((best, c) => (fameOf(c.id) > fameOf(best.id) ? c : best));

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
    // Same-name ties break by fame: "ronaldo" means Cristiano/R9, never a
    // lower-division namesake.
    const bothInCluster = exactCluster.filter((c) => playedBoth(c.id));
    matched = bothInCluster.length > 0 ? mostFamous(bothInCluster) : mostFamous(exactCluster);
    correct = bothInCluster.length > 0;
  } else {
    // Approximate spelling (a typo) → auto-correct to the closest player who
    // actually played BOTH teams. BUT only when the match is genuinely close, so a
    // loose trigram overlap ("messi" → "Gaizka Mendieta") or garbage ("aab") is NOT
    // accepted just because that player happened to play both. Auto-correct is for
    // fixing fast-typing typos, not for guessing points. Closeness is trigram OR
    // edit-distance — the latter rescues one-letter slips trigram undervalues
    // ("pijanic" → Pjanić), while EDIT_ACCEPT keeps rivaldo/ronaldo-style
    // confusions and garbage out.
    const bothAccepted = eligible.filter(
      (c) => playedBoth(c.id) && (c.sim >= AUTOCORRECT_MIN || editAccepts(norm, c.nameNorm)),
    );
    if (bothAccepted.length > 0) {
      matched = mostFamous(bothAccepted);
      correct = true;
      autocorrected = true;
    } else {
      correct = false;
    }
  }

  // A wrong guess surfaces "you meant X" — make X the player the human plausibly
  // meant: among the candidates whose similarity is within a whisker of the top,
  // show the most FAMOUS one, not whoever wins the trigram coin-flip. Typing
  // "pijanic" should present Miralem Pjanić, never an obscure near-anagram.
  if (!correct) {
    const SIM_BAND = 0.13;
    const nearTop = eligible.filter((c) => c.sim >= eligible[0]!.sim - SIM_BAND);
    matched = mostFamous(nearTop);
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
    matchedPlayer: { id: matched.id, name: matched.name, sim: matched.sim, imageUrl: matched.imageUrl },
    spellsA,
    spellsB,
    allClubs,
  };
}

// ======================= PLAYER-PLAYER MODE =======================

/** Fuzzy search for players by name. */
export async function searchPlayers(query: string, limit = 30): Promise<PlayerRef[]> {
  const norm = normalize(query);
  if (!norm) return [];
  const { rows } = await pool.query<{ id: string; name: string; image_url: string | null; sim: number }>(
    `SELECT p.id, p.name, p.image_url,
            word_similarity($1, p.name_norm) AS sim
     FROM players p
     WHERE word_similarity($1, p.name_norm) >= 0.25
     ORDER BY sim DESC, (p.image_url IS NOT NULL) DESC
     LIMIT $2`,
    [norm, limit],
  );
  return rows.map(r => ({ id: Number(r.id), name: r.name, imageUrl: r.image_url }));
}

/** Pick a random player who has spells at multiple clubs (so there's a crossover answer). */
export async function randomPlayer(difficulty: 'easy' | 'medium' | 'hard'): Promise<PlayerRef | null> {
  const minClubs = difficulty === 'easy' ? 4 : difficulty === 'medium' ? 3 : 2;
  const { rows } = await pool.query<{ id: string; name: string; image_url: string | null }>(
    `SELECT p.id, p.name, p.image_url
     FROM players p
     WHERE (SELECT COUNT(DISTINCT pc.club_id) FROM player_clubs pc
            JOIN clubs c ON c.id = pc.club_id AND c.is_national = false
            WHERE pc.player_id = p.id) >= $1
       AND p.image_url IS NOT NULL
     ORDER BY random()
     LIMIT 1`,
    [minClubs],
  );
  if (rows.length === 0) return null;
  const r = rows[0]!;
  return { id: Number(r.id), name: r.name, imageUrl: r.image_url };
}

/** Check if two players share at least one non-national club. */
export async function hasCommonClubs(playerAId: number, playerBId: number): Promise<boolean> {
  const { rows } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM (
       SELECT pa.club_id FROM player_clubs pa
       JOIN player_clubs pb ON pb.club_id = pa.club_id AND pb.player_id = $2
       JOIN clubs c ON c.id = pa.club_id AND c.is_national = false
       WHERE pa.player_id = $1
       LIMIT 1
     ) x`,
    [playerAId, playerBId],
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

/** Find clubs where both players played. */
export async function commonClubs(
  playerAId: number, playerBId: number, limit = 5,
): Promise<{ id: number; name: string; logoUrl: string | null }[]> {
  const { rows } = await pool.query<{ id: string; name: string; logo_url: string | null }>(
    `SELECT c.id, c.name, c.logo_url
     FROM clubs c
     WHERE c.is_national = false
       AND EXISTS (SELECT 1 FROM player_clubs WHERE player_id = $1 AND club_id = c.id)
       AND EXISTS (SELECT 1 FROM player_clubs WHERE player_id = $2 AND club_id = c.id)
     ORDER BY c.popularity DESC NULLS LAST
     LIMIT $3`,
    [playerAId, playerBId, limit],
  );
  return rows.map(r => ({ id: Number(r.id), name: r.name, logoUrl: r.logo_url }));
}

export interface VerifyPlayerPlayerResult {
  correct: boolean;
  matchedClubId: number | null;
  matchedClubName: string | null;
  matchedClubLogo: string | null;
  autocorrected: boolean;
  /** Each player's spells at the matched club */
  spellsA: SpellInfo[];
  spellsB: SpellInfo[];
}

/** Verify a club name guess for player-player mode. */
export async function verifyPlayerPlayerGuess(
  playerAId: number, playerBId: number, guess: string,
): Promise<VerifyPlayerPlayerResult> {
  const norm = normalize(guess);
  if (!norm) return { correct: false, matchedClubId: null, matchedClubName: null, matchedClubLogo: null, autocorrected: false, spellsA: [], spellsB: [] };

  // Fuzzy-find club candidates
  const { rows: candidates } = await pool.query<{ id: string; name: string; name_norm: string; logo_url: string | null; sim: number }>(
    `SELECT c.id, c.name, c.name_norm, c.logo_url,
            word_similarity($1, c.name_norm) AS sim
     FROM clubs c
     WHERE c.is_national = false AND word_similarity($1, c.name_norm) >= ${config.verifyMatchThreshold}
     ORDER BY sim DESC
     LIMIT 25`,
    [norm],
  );
  if (candidates.length === 0) return { correct: false, matchedClubId: null, matchedClubName: null, matchedClubLogo: null, autocorrected: false, spellsA: [], spellsB: [] };

  const top = candidates[0]!;
  const isExact = top.sim >= config.verifyExactThreshold;

  if (isExact) {
    // Strict: check THIS specific club
    const clubId = Number(top.id);
    const bothPlayed = await bothPlayedAtClub(clubId, playerAId, playerBId);
    if (bothPlayed) {
      return await buildPlayerPlayerResult(clubId, top.name, top.logo_url, playerAId, playerBId, false);
    }
    return { correct: false, matchedClubId: null, matchedClubName: null, matchedClubLogo: null, autocorrected: false, spellsA: [], spellsB: [] };
  }

  // Approximate: find best club where both played
  for (const c of candidates) {
    const clubId = Number(c.id);
    const bothPlayed = await bothPlayedAtClub(clubId, playerAId, playerBId);
    if (bothPlayed) {
      return await buildPlayerPlayerResult(clubId, c.name, c.logo_url, playerAId, playerBId, clubId !== Number(top.id));
    }
  }
  return { correct: false, matchedClubId: null, matchedClubName: null, matchedClubLogo: null, autocorrected: false, spellsA: [], spellsB: [] };
}

async function bothPlayedAtClub(clubId: number, playerAId: number, playerBId: number): Promise<boolean> {
  const { rows } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(DISTINCT player_id) AS cnt FROM player_clubs
     WHERE club_id = $1 AND player_id = ANY($2)`,
    [clubId, [playerAId, playerBId]],
  );
  return Number(rows[0]?.cnt ?? 0) >= 2;
}

async function buildPlayerPlayerResult(
  clubId: number, clubName: string, clubLogo: string | null,
  playerAId: number, playerBId: number, autocorrected: boolean,
): Promise<VerifyPlayerPlayerResult> {
  const [spellsA, spellsB] = await Promise.all([
    getPlayerSpellsAtClub(playerAId, clubId, clubName, clubLogo),
    getPlayerSpellsAtClub(playerBId, clubId, clubName, clubLogo),
  ]);
  return { correct: true, matchedClubId: clubId, matchedClubName: clubName, matchedClubLogo: clubLogo, autocorrected, spellsA, spellsB };
}

async function getPlayerSpellsAtClub(playerId: number, clubId: number, clubName: string, clubLogo: string | null): Promise<SpellInfo[]> {
  const { rows } = await pool.query<{ start_year: number | null; end_year: number | null }>(
    `SELECT start_year, end_year FROM player_clubs WHERE player_id = $1 AND club_id = $2`,
    [playerId, clubId],
  );
  return rows.map(r => ({ clubId, clubName, logoUrl: clubLogo, startYear: r.start_year, endYear: r.end_year }));
}
