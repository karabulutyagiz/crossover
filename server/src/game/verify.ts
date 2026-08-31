import { pool } from '../db/pool.ts';
import { config } from '../config.ts';
import { normalize } from './normalize.ts';
import { BOT_POOLS } from './botpools.ts';
import { createMatchClubSelectionState, selectBotTeamForMatchup } from './matchupSelection.ts';
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
  AND c.name_norm <> 'atletico madrileno'
  AND c.name_norm <> 'atletico mg'
`;
const CLUB_ALIAS_MATCH = `EXISTS (
  SELECT 1 FROM unnest(c.aliases) a
  WHERE a = $1 OR a LIKE '%' || $1 || '%' OR a % $1
)`;
const CLUB_ALIAS_PREFIX = `EXISTS (
  SELECT 1 FROM unnest(c.aliases) a
  WHERE a LIKE $1 || '%'
)`;
const CLUB_ALIAS_SIM = `COALESCE((SELECT MAX(similarity(a, $1)) FROM unnest(c.aliases) a), 0)`;
const CLUB_ALIAS_WORD_SIM = `COALESCE((SELECT MAX(word_similarity($1, a)) FROM unnest(c.aliases) a), 0)`;

function clubDisplayName(id: number, name: string): string {
  return id === 13 ? 'Atletico Madrid' : name;
}

function clubHitFromRow(r: { id: string; name: string; logo_url: string | null }): ClubHit {
  const id = Number(r.id);
  return { id, name: clubDisplayName(id, r.name), logoUrl: r.logo_url };
}

async function canonicalClubHit(id: number): Promise<ClubHit | null> {
  const { rows } = await pool.query<{ id: string; name: string; logo_url: string | null }>(
    'SELECT id, name, logo_url FROM clubs WHERE id = $1',
    [id],
  );
  const r = rows[0];
  return r ? clubHitFromRow(r) : null;
}

export async function searchClubs(
  query: string,
  scope: Scope = { type: 'all' },
  limit = 24,
): Promise<ClubHit[]> {
  const norm = normalize(query);
  if (norm.startsWith('atletico')) {
    const atletico = await canonicalClubHit(13);
    return atletico ? [atletico] : [];
  }
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
    return rows.map(clubHitFromRow);
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
            GREATEST(similarity(c.name_norm, $1), ${CLUB_ALIAS_SIM}) AS sim,
            COALESCE(NULLIF(c.popularity, 0), (SELECT COUNT(*) FROM player_clubs pc2 WHERE pc2.club_id = c.id)) AS members
       FROM clubs c
      WHERE c.is_national = false
        AND c.logo_url IS NOT NULL
        AND EXISTS (SELECT 1 FROM player_clubs pc WHERE pc.club_id = c.id)
        AND (c.name_norm LIKE '%' || $1 || '%' OR c.name_norm % $1 OR ${CLUB_ALIAS_MATCH})
        ${A_TEAM_ONLY}
        ${scopeSql}
      ORDER BY (c.name_norm = $1 OR $1 = ANY(c.aliases)) DESC,
               (c.league IS NOT NULL) DESC,
               members DESC,
               (c.name_norm LIKE $1 || '%' OR ${CLUB_ALIAS_PREFIX}) DESC,
               sim DESC,
               length(c.name) ASC
      LIMIT $${limitIdx}`,
    params,
  );
  return rows.map(clubHitFromRow);
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

// ---- Vowel-dropped fast typing ("srgjn" → "Sergen") ----
// Skipping vowels while typing fast is a common REAL typo class, but it scores
// terribly on both trigram (almost no shared trigrams) and plain edit distance
// ("srgjn"→"sergen" = 0.667, below EDIT_ACCEPT). Compare consonant SKELETONS
// instead — and only when the guess itself is (near-)vowel-free: a fully
// vowelled guess is a different NAME, not this typo class, so "rivaldo" can
// never become "ronaldo" through this gate. Bare stubs stay out via the length
// guards ("ser"/"srg" are too short).
const VOWELS_RE = /[aeiou]/g;
function consonantSkeleton(s: string): string {
  return s.replace(/[^a-z]/g, '').replace(VOWELS_RE, '');
}
function vowelDropAccepts(guessNorm: string, nameNorm: string): boolean {
  const flat = guessNorm.replace(/[^a-z]/g, '');
  const vowels = (flat.match(VOWELS_RE) ?? []).length;
  if (flat.length < 4 || vowels > 1) return false; // not vowel-dropped typing
  const gs = consonantSkeleton(guessNorm);
  if (gs.length < 4) return false;
  for (const target of [nameNorm, ...nameNorm.split(' ')]) {
    const ts = consonantSkeleton(target);
    if (ts.length >= 3 && editDistance(gs, ts) <= 1) return true;
  }
  return false;
}

function nameTokens(nameNorm: string): string[] {
  return nameNorm.split(' ').filter((t) => t.length > 0);
}

function tokenSetIncludesAll(haystack: Set<string>, needles: string[]): boolean {
  return needles.length > 0 && needles.every((t) => haystack.has(t));
}

// Prefer a valid answer when the typed name clearly identifies one of this
// round's actual answers. `word_similarity('pedro', 'luis pedro cavanda') = 1`,
// so the generic fuzzy pass could otherwise judge the wrong Pedro while the
// result screen lists the real shared Pedro below. This resolver runs only over
// players who played for BOTH teams and rewards exact full-name/token coverage
// before falling back to the typo gates used by the generic matcher.
function validAnswerNameScore(guessNorm: string, playerNameNorm: string): number {
  if (!guessNorm || !playerNameNorm) return 0;
  if (guessNorm === playerNameNorm) return 100;
  const guessTokens = nameTokens(guessNorm);
  const playerTokens = nameTokens(playerNameNorm);
  const guessSet = new Set(guessTokens);
  const playerSet = new Set(playerTokens);

  // Stored short name, user wrote a fuller real-world name: "pedro rodriguez"
  // should still resolve to Transfermarkt's stored "Pedro".
  if (playerTokens.length === 1 && guessSet.has(playerTokens[0]!)) return 92;
  // Surname / unique token answer: "sosa" -> "jose sosa".
  if (guessTokens.length === 1 && playerSet.has(guessTokens[0]!)) return 86 - Math.min(playerTokens.length, 6);
  // Tokens supplied in any order: "ronaldo cristiano" -> "cristiano ronaldo".
  if (tokenSetIncludesAll(guessSet, playerTokens)) return 82;
  if (tokenSetIncludesAll(playerSet, guessTokens)) return 78;

  if (editAccepts(guessNorm, playerNameNorm)
    || vowelDropAccepts(guessNorm, playerNameNorm)) {
    return 62;
  }
  return 0;
}

// Anti-stub guard for the TRIGRAM autocorrect path: a half-typed prefix must
// not win the round ("ser" → Sergen is a lazy stab, not a typo — user rule).
// The guess must be ≥4 chars AND cover ≥60% of some real token of the name.
function notAStub(guessNorm: string, nameNorm: string): boolean {
  if (guessNorm.length < 4) return false;
  return nameNorm.split(' ').some((t) => t.length >= 4 && guessNorm.length >= Math.ceil(t.length * 0.6));
}

const EASY_TOP = 20;    // top 20 only
const MEDIUM_FROM = 21; // skip the mega-famous
const MEDIUM_TO = 80;
const HARD_FROM = 81;
const HARD_TO = 250;
const HUMANLIKE_COUNTRIES = ['Türkiye', 'Brazil', 'France', 'Argentina', 'Germany', 'Spain', 'Italy', 'Portugal', 'Netherlands', 'England'];

function pickWeightedClub<T extends { pop: number }>(rows: T[]): T | undefined {
  if (!rows.length) return undefined;
  const weights = rows.map((r, i) => Math.max(1, Math.sqrt(Math.max(1, Number(r.pop) || 1)) / (1 + i * 0.18)));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < rows.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return rows[i];
  }
  return rows[0];
}

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
  return r ? clubHitFromRow(r) : null;
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
            ${A_TEAM_ONLY}
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
  return r ? clubHitFromRow(r) : null;
}

// Matchmaking fallback botları zorluk seçilen solo bot gibi davranmaz: gerçek bir
// oyuncu hissi için easy+medium bilinirlikte takımları karışık seçer, hard/obscure
// havuzuna düşmez. İnsan bir takım seçtiyse ortak oyunculu seçenekler önceliklidir.
export async function botPickHumanLike(playerTeamId: number | null, excludeIds: number[] = []): Promise<ClubHit | null> {
  const selected = await selectBotTeamForMatchup({
    playerTeamId,
    excludeIds,
    state: createMatchClubSelectionState(),
  }).catch(() => null);
  if (selected?.club) return selected.club;
  return botPickFromPool('medium', playerTeamId, excludeIds);
}

export interface ScopeOption {
  value: string;
  displayName?: string;
  count: number;
  logoUrl?: string | null;
}

// API-Football league IDs for logo URLs. Hem İSİM hem TM KODU anahtarlanır:
// dev DB clubs.league=TM kodu (ES1…), prod isim ('La Liga') olabilir — ikisi de
// çalışsın diye kod anahtarları da eklendi (2026-08-29, lig ekseni + scope logosu).
const LEAGUE_LOGOS: Record<string, number> = {
  ES1: 140, GB1: 39, L1: 78, IT1: 135, TR1: 203, FR1: 61, // TM kodları (büyük ligler)
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
      -- EN BİLİNDİK önce (kullanıcı kararı 2026-08-28): şöhret = oynadığı en
      -- popüler kulübün popülerliği (topCommonPlayerByPopularity ile aynı ölçü).
      ORDER BY (p.image_url IS NOT NULL) DESC,
               (SELECT MAX(GREATEST(COALESCE(fc.popularity, 0), (SELECT count(*) FROM player_clubs x WHERE x.club_id = fpc.club_id)))
                  FROM player_clubs fpc JOIN clubs fc ON fc.id = fpc.club_id
                 WHERE fpc.player_id = p.id) DESC NULLS LAST
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
      -- EN BİLİNDİK önce (2026-08-28) — sonuç ekranındaki 'diğer oyuncular'.
      ORDER BY (p.image_url IS NOT NULL) DESC,
               (SELECT MAX(GREATEST(COALESCE(fc.popularity, 0), (SELECT count(*) FROM player_clubs x WHERE x.club_id = fpc.club_id)))
                  FROM player_clubs fpc JOIN clubs fc ON fc.id = fpc.club_id
                 WHERE fpc.player_id = p.id) DESC NULLS LAST
      LIMIT $3`,
    [teamAId, teamBId, limit],
  );
  return rows.map((r) => ({ name: r.name, imageUrl: r.image_url }));
}

/** İki takımda da oynamış EN POPÜLER tek oyuncu (foto ile). XOX'ta maç bitince
 * boş kutucuklara "buraya kim gelirdi" göstermek için kullanılır. Popülerlik =
 * oyuncunun oynadığı kulüplerin en yükseğinin popülerliği (clubs.popularity) ya
 * da o kulübün oyuncu-sayısı fame'i — plausibleWrong ile aynı fame ölçüsü. */
export async function topCommonPlayerByPopularity(
  teamAId: number,
  teamBId: number,
): Promise<CommonPlayerInfo | null> {
  const { rows } = await pool.query<{ name: string; image_url: string | null }>(
    `SELECT p.name, p.image_url,
            MAX(GREATEST(COALESCE(c.popularity, 0),
                (SELECT count(*) FROM player_clubs x WHERE x.club_id = pc.club_id))) AS fame
       FROM players p
       JOIN player_clubs a ON a.player_id = p.id AND a.club_id = $1
       JOIN player_clubs b ON b.player_id = p.id AND b.club_id = $2
       JOIN player_clubs pc ON pc.player_id = p.id
       JOIN clubs c ON c.id = pc.club_id
      GROUP BY p.id, p.name, p.image_url
      ORDER BY fame DESC, (p.image_url IS NOT NULL) DESC
      LIMIT 1`,
    [teamAId, teamBId],
  );
  const r = rows[0];
  return r ? { name: r.name, imageUrl: r.image_url } : null;
}

export async function plausibleWrongPlayersTeamTeam(teamAId: number, teamBId: number, limit = 16): Promise<string[]> {
  const { rows } = await pool.query<{ name: string }>(
    `WITH side_players AS (
       SELECT DISTINCT p.id, p.name, p.image_url,
              MAX(GREATEST(COALESCE(c.popularity, 0), (SELECT count(*) FROM player_clubs x WHERE x.club_id = pc2.club_id))) AS fame
         FROM players p
         JOIN player_clubs pc ON pc.player_id = p.id AND pc.club_id IN ($1, $2)
         JOIN player_clubs pc2 ON pc2.player_id = p.id
         JOIN clubs c ON c.id = pc2.club_id
        WHERE NOT (
          EXISTS (SELECT 1 FROM player_clubs a WHERE a.player_id = p.id AND a.club_id = $1)
          AND EXISTS (SELECT 1 FROM player_clubs b WHERE b.player_id = p.id AND b.club_id = $2)
        )
        GROUP BY p.id, p.name, p.image_url
     )
     SELECT name FROM side_players
      ORDER BY (image_url IS NOT NULL) DESC, fame DESC, random()
      LIMIT $3`,
    [teamAId, teamBId, limit],
  );
  return rows.map((r) => r.name);
}

// ---- Country-Team & Letter-Team helpers ----

const MIN_SPELL_YEAR = 1980;
const ACTIVE_SPELL_SQL = `COALESCE(pc.end_year, pc.start_year, 9999) >= ${MIN_SPELL_YEAR}`;

export interface CountryTeamAnswerCandidate {
  playerId: number;
  canonicalName: string;
  imageUrl: string | null;
  confidence: 1;
  popularityScore: number;
  fame: number;
}

function popularityScoreFromFame(fame: number): number {
  return Number(Math.max(0, Math.min(1, Math.log10(Math.max(1, fame)) / 9.5)).toFixed(4));
}

const NATIONALITY_ALIAS_GROUPS = [
  ['Turkey', 'Türkiye'],
  ['United Arab Emirates', 'United-Arab-Emirates'],
  ['Saudi Arabia', 'Saudi-Arabia'],
  ['Korea, South', 'South Korea', 'South-Korea'],
  ['Czech Republic', 'Czech-Republic'],
  ['Northern Ireland', 'Northern-Ireland'],
  ['Bosnia-Herzegovina', 'Bosnia and Herzegovina'],
  ['United States', 'USA'],
] as const;

function nationalityVariants(country: string): string[] {
  const variants = new Set<string>([country]);
  const normalized = normalize(country);
  for (const group of NATIONALITY_ALIAS_GROUPS) {
    if (!group.some((entry) => normalize(entry) === normalized)) continue;
    for (const entry of group) variants.add(entry);
  }
  return [...variants];
}

/** Players who played for the club AND have the given nationality. */
export async function commonPlayersCountryTeam(
  clubId: number,
  country: string,
  limit = 5,
): Promise<CommonPlayerInfo[]> {
  const players = await getValidPlayersForCountryAndClub(clubId, country, limit);
  return players.map((p) => ({ name: p.canonicalName, imageUrl: p.imageUrl }));
}

export async function getValidPlayersForCountryAndClub(
  clubId: number,
  country: string,
  limit = 12,
): Promise<CountryTeamAnswerCandidate[]> {
  const countries = nationalityVariants(country);
  const { rows } = await pool.query<{ id: string; name: string; image_url: string | null; fame: string; career_count: string }>(
    `SELECT p.id,
            p.name,
            p.image_url,
            count(DISTINCT pc2.club_id) AS career_count,
            COALESCE(MAX(GREATEST(COALESCE(c2.popularity, 0), (SELECT count(*) FROM player_clubs x WHERE x.club_id = pc2.club_id))), 0) AS fame
       FROM players p
       JOIN player_clubs pc ON pc.player_id = p.id AND pc.club_id = $1
       JOIN clubs c ON c.id = pc.club_id AND c.is_national = false
       LEFT JOIN player_clubs pc2 ON pc2.player_id = p.id
       LEFT JOIN clubs c2 ON c2.id = pc2.club_id
      WHERE ${ACTIVE_SPELL_SQL}
        AND p.nationality = ANY($2)
      GROUP BY p.id, p.name, p.image_url
      ORDER BY (p.image_url IS NOT NULL) DESC,
               fame DESC,
               career_count DESC,
               p.name ASC
      LIMIT $3`,
    [clubId, countries, limit],
  );
  return rows.map((r) => {
    const fame = Number(r.fame);
    return {
      playerId: Number(r.id),
      canonicalName: r.name,
      imageUrl: r.image_url,
      confidence: 1,
      popularityScore: popularityScoreFromFame(fame),
      fame,
    };
  });
}

// ── XOX ülke/bayrak ekseni (2026-08-29) ──────────────────────────────────────
// Milli takım kulübü YERİNE players.nationality kullanılır (yerel + prod'da dolu).
// Doğrulama commonPlayersCountryTeam ile AYNI motor → sıfır yeni hata yüzeyi.

/** Milliyet string'i için bayrak emojisi — DB "Türkiye" (TR) saklarken FLAGS
 * anahtarı "Turkey" olabilir; variant'lar üzerinden güvenle çözer. Yoksa null. */
export function flagForNationality(country: string): string | null {
  for (const v of [country, ...nationalityVariants(country)]) {
    const f = countryFlag(v);
    if (f) return f;
  }
  return null;
}

/** Milliyetin TR görünen adı (ör. "Italy" → "İtalya"); yoksa ham değer. */
export function nationalityDisplay(country: string): string {
  return COUNTRY_NAME_TR[country] ?? country;
}

/** XOX ülke ekseni: verilen 3 kulübün HER BİRİYLE ≥min oyuncusu olan, BAYRAĞI
 * bulunan bir milliyet seçer (tanıdık ülkeler + bol oyunculu önce). Yoksa null —
 * çağıran o zaman ülke KOYMAZ, grid tüm-kulüp kalır (grid asla bozulmaz). Sayım
 * ham nationality iledir; verify variant'ları da kabul ettiğinden verify ≥ sayım
 * (güvenli yön — asla fazla saymaz). */
export async function pickXoxCountryForClubs(
  clubIds: number[],
  min: number,
): Promise<{ country: string; name: string; flag: string; counts: [number, number, number] } | null> {
  if (clubIds.length !== 3) return null;
  const { rows } = await pool.query<{ nationality: string; n1: string; n2: string; n3: string }>(
    `SELECT p.nationality,
            count(DISTINCT p.id) FILTER (WHERE pc.club_id = $1) AS n1,
            count(DISTINCT p.id) FILTER (WHERE pc.club_id = $2) AS n2,
            count(DISTINCT p.id) FILTER (WHERE pc.club_id = $3) AS n3
       FROM player_clubs pc
       JOIN players p ON p.id = pc.player_id
      WHERE pc.club_id = ANY($4::bigint[])
        AND ${ACTIVE_SPELL_SQL}
        AND p.nationality IS NOT NULL AND p.nationality <> ''
      GROUP BY p.nationality`,
    [clubIds[0], clubIds[1], clubIds[2], clubIds],
  );
  const viable = rows
    .map((r) => {
      const counts: [number, number, number] = [Number(r.n1), Number(r.n2), Number(r.n3)];
      return { country: r.nationality, counts, n: Math.min(...counts), flag: flagForNationality(r.nationality) };
    })
    .filter((r): r is { country: string; counts: [number, number, number]; n: number; flag: string } => r.n >= min && r.flag != null);
  if (!viable.length) return null;
  viable.sort((a, b) => {
    const fa = HUMANLIKE_COUNTRIES.includes(a.country) ? 1 : 0;
    const fb = HUMANLIKE_COUNTRIES.includes(b.country) ? 1 : 0;
    if (fa !== fb) return fb - fa;        // tanıdık ülkeler önce
    return b.n - a.n;                     // sonra en kolay (bol oyunculu)
  });
  const top = viable.slice(0, Math.min(4, viable.length));
  const pick = top[Math.floor(Math.random() * top.length)]!;
  return { country: pick.country, name: nationalityDisplay(pick.country), flag: pick.flag, counts: pick.counts };
}

/** XOX boş-hücre reveal + botun "bildiği" cevap: kulüp+milliyet EN ÜNLÜ oyuncu. */
export async function topPlayerForCountryAndClub(
  clubId: number,
  country: string,
): Promise<{ name: string; imageUrl: string | null } | null> {
  const cands = await getValidPlayersForCountryAndClub(clubId, country, 1).catch(() => [] as CountryTeamAnswerCandidate[]);
  const t = cands[0];
  return t ? { name: t.canonicalName, imageUrl: t.imageUrl } : null;
}

// ── XOX lig ekseni (büyük ligler, 2026-08-29) ────────────────────────────────
// Yalnız 6 büyük lig. Hücre = kesişen kulüpte oynamış VE bu ligde oynamış oyuncu.
// clubs.league dev'de TM KODU (ES1…), prod'da İSİM ('La Liga') olabilir → her iki
// biçim de dbValues ile eşlenir. Üretim (pickXoxLeagueForClubs) kesişen kulübün
// O LİGDE OLMADIĞINI garanti eder → trivial "o ligin kendi kulübü" hücresi oluşmaz,
// böylece SIMPLE kural (bu ligde herhangi bir kulüpte oynamış) hem doğru hem sezgisel
// (Messi gibi tek-kulüp oyuncular yanlışlıkla elenmez; kesişen kulüp zaten o ligde değil).
interface XoxBigLeague { code: string; name: string; apiId: number; dbValues: string[] }
const XOX_BIG_LEAGUES: XoxBigLeague[] = [
  { code: 'ES1', name: 'LaLiga',      apiId: 140, dbValues: ['ES1', 'La Liga', 'LaLiga', 'Primera Division'] },
  { code: 'GB1', name: 'Premier Lig', apiId: 39,  dbValues: ['GB1', 'Premier League'] },
  { code: 'L1',  name: 'Bundesliga',  apiId: 78,  dbValues: ['L1', 'Bundesliga'] },
  { code: 'IT1', name: 'Serie A',     apiId: 135, dbValues: ['IT1', 'Serie A'] },
  { code: 'TR1', name: 'Süper Lig',   apiId: 203, dbValues: ['TR1', 'Süper Lig', 'Super Lig'] },
  { code: 'FR1', name: 'Ligue 1',     apiId: 61,  dbValues: ['FR1', 'Ligue 1'] },
];
const XOX_LEAGUE_BY_CODE = new Map(XOX_BIG_LEAGUES.map((l) => [l.code, l] as const));
const XOX_LEAGUE_CODE_BY_DBVALUE = new Map<string, string>();
for (const l of XOX_BIG_LEAGUES) for (const v of l.dbValues) XOX_LEAGUE_CODE_BY_DBVALUE.set(v, l.code);

export function xoxLeagueDisplay(code: string): string { return XOX_LEAGUE_BY_CODE.get(code)?.name ?? code; }
export function xoxLeagueLogo(code: string): string | null {
  const l = XOX_LEAGUE_BY_CODE.get(code);
  return l ? `https://media.api-sports.io/football/leagues/${l.apiId}.png` : null;
}
function leagueDbValues(code: string): string[] { return XOX_LEAGUE_BY_CODE.get(code)?.dbValues ?? [code]; }
const LEAGUE_SPELL_ACTIVE = (a: string) => `COALESCE(${a}.end_year, ${a}.start_year, 9999) >= ${MIN_SPELL_YEAR}`;

/** Kesişen kulüpte oynamış VE bu ligde (herhangi bir kulüpte) oynamış oyuncular — fame sıralı. */
export async function getValidPlayersForLeagueAndClub(
  clubId: number, leagueCode: string, limit = 12,
): Promise<CountryTeamAnswerCandidate[]> {
  const vals = leagueDbValues(leagueCode);
  const { rows } = await pool.query<{ id: string; name: string; image_url: string | null; fame: string; career_count: string }>(
    `SELECT p.id, p.name, p.image_url,
            count(DISTINCT pc2.club_id) AS career_count,
            COALESCE(MAX(GREATEST(COALESCE(c2.popularity, 0), (SELECT count(*) FROM player_clubs x WHERE x.club_id = pc2.club_id))), 0) AS fame
       FROM players p
       JOIN player_clubs pc ON pc.player_id = p.id AND pc.club_id = $1
       LEFT JOIN player_clubs pc2 ON pc2.player_id = p.id
       LEFT JOIN clubs c2 ON c2.id = pc2.club_id
      WHERE ${ACTIVE_SPELL_SQL}
        AND EXISTS (SELECT 1 FROM player_clubs pl JOIN clubs cl ON cl.id = pl.club_id
                     WHERE pl.player_id = p.id AND cl.league = ANY($2) AND ${LEAGUE_SPELL_ACTIVE('pl')})
      GROUP BY p.id, p.name, p.image_url
      ORDER BY (p.image_url IS NOT NULL) DESC, fame DESC, career_count DESC, p.name ASC
      LIMIT $3`,
    [clubId, vals, limit],
  );
  return rows.map((r) => {
    const fame = Number(r.fame);
    return { playerId: Number(r.id), canonicalName: r.name, imageUrl: r.image_url, confidence: 1, popularityScore: popularityScoreFromFame(fame), fame };
  });
}

export async function topPlayerForLeagueAndClub(clubId: number, leagueCode: string): Promise<{ name: string; imageUrl: string | null } | null> {
  const cands = await getValidPlayersForLeagueAndClub(clubId, leagueCode, 1).catch(() => [] as CountryTeamAnswerCandidate[]);
  const t = cands[0];
  return t ? { name: t.canonicalName, imageUrl: t.imageUrl } : null;
}

/** Sunucu-otoriter re-check: eşleşen oyuncu gerçekten kulüpte+ligde mi. */
export async function validateLeagueTeamPlayerId(clubId: number, leagueCode: string, playerId: number): Promise<boolean> {
  if (!Number.isFinite(clubId) || !Number.isFinite(playerId)) return false;
  const vals = leagueDbValues(leagueCode);
  const { rows } = await pool.query<{ id: string }>(
    `SELECT p.id FROM players p
       JOIN player_clubs pc ON pc.player_id = p.id AND pc.club_id = $1
      WHERE p.id = $3 AND ${ACTIVE_SPELL_SQL}
        AND EXISTS (SELECT 1 FROM player_clubs pl JOIN clubs cl ON cl.id = pl.club_id
                     WHERE pl.player_id = p.id AND cl.league = ANY($2) AND ${LEAGUE_SPELL_ACTIVE('pl')})
      LIMIT 1`,
    [clubId, vals, playerId],
  );
  return rows.length > 0;
}

export async function verifyLeagueTeamGuess(clubId: number, leagueCode: string, guess: string): Promise<VerifyResult> {
  const club = await getClub(clubId);
  if (!club) throw new Error('Unknown club id');
  const pseudoLeague: ClubHit = { id: 0, name: xoxLeagueDisplay(leagueCode), logoUrl: xoxLeagueLogo(leagueCode) };
  const norm = normalize(guess);
  const empty: Omit<VerifyResult, 'correct' | 'reason' | 'matchedPlayer'> = {
    autocorrected: false, teamA: pseudoLeague, teamB: club, spellsA: [], spellsB: [], allClubs: [],
  };
  if (!norm) return { correct: false, reason: 'no_match', matchedPlayer: null, ...empty };
  const vals = leagueDbValues(leagueCode);
  const { rows: cands } = await pool.query<{ id: string; name: string; sim: number; image_url: string | null }>(
    `SELECT picked.id, picked.name, picked.image_url, picked.sim
       FROM (
         SELECT DISTINCT ON (p.id) p.id, p.name, p.image_url,
                word_similarity($1, p.name_norm) AS sim,
                (SELECT count(*) FROM player_clubs c WHERE c.player_id = p.id) AS career_count
           FROM players p
           JOIN player_clubs pc ON pc.player_id = p.id
          WHERE pc.club_id = $2
            AND ${ACTIVE_SPELL_SQL}
            AND EXISTS (SELECT 1 FROM player_clubs pl JOIN clubs cl ON cl.id = pl.club_id
                         WHERE pl.player_id = p.id AND cl.league = ANY($3) AND ${LEAGUE_SPELL_ACTIVE('pl')})
            AND word_similarity($1, p.name_norm) >= $4
          ORDER BY p.id, sim DESC, (p.image_url IS NOT NULL) DESC, career_count DESC
       ) AS picked
      ORDER BY picked.sim DESC, (picked.image_url IS NOT NULL) DESC, picked.career_count DESC
      LIMIT 15`,
    [norm, clubId, vals, config.verifyMatchThreshold],
  );
  const eligible = cands.map((c) => ({ id: Number(c.id), name: c.name, sim: Number(c.sim), imageUrl: c.image_url }));
  if (eligible.length === 0) return { correct: false, reason: 'no_match', matchedPlayer: null, ...empty };
  let matched = eligible[0]!; let correct: boolean; let autocorrected = false;
  const exactCluster = eligible.filter((c) => c.sim >= config.verifyExactThreshold);
  if (exactCluster.length > 0) { matched = exactCluster[0]!; correct = true; }
  else if ((eligible[0]!.sim >= AUTOCORRECT_MIN && notAStub(norm, normalize(eligible[0]!.name)))
    || editAccepts(norm, normalize(eligible[0]!.name)) || vowelDropAccepts(norm, normalize(eligible[0]!.name))) {
    matched = eligible[0]!; correct = true; autocorrected = true;
  } else { matched = eligible[0]!; correct = false; }
  if (correct) correct = await validateLeagueTeamPlayerId(clubId, leagueCode, matched.id);
  const allClubs = await getPlayerSpells(matched.id);
  const spellsB = allClubs.filter((s) => s.clubId === clubId);
  return { correct, reason: correct ? 'both' : 'not_both', autocorrected, teamA: pseudoLeague, teamB: club, matchedPlayer: { id: matched.id, name: matched.name, sim: matched.sim, imageUrl: matched.imageUrl }, spellsA: [], spellsB, allClubs };
}

/** XOX lig ekseni üretimi: kesişen 3 kulübün HER BİRİYLE ≥min oyuncusu olan bir
 * büyük lig seçer. ÖNCE o 3 kulübün KENDİ ligleri hariç tutulur (trivial hücre yok).
 * Sayım = "kulüpte oynadı + ligde oynadı" (verify ile birebir aynı). Yoksa null. */
export async function pickXoxLeagueForClubs(
  clubIds: number[], min: number,
): Promise<{ code: string; name: string; logoUrl: string; counts: [number, number, number] } | null> {
  if (clubIds.length !== 3) return null;
  const { rows: own } = await pool.query<{ league: string | null }>(`SELECT league FROM clubs WHERE id = ANY($1::bigint[])`, [clubIds]);
  const excludeCodes = new Set<string>();
  for (const r of own) { const code = r.league ? XOX_LEAGUE_CODE_BY_DBVALUE.get(r.league) : undefined; if (code) excludeCodes.add(code); }
  const candLeagues = XOX_BIG_LEAGUES.filter((l) => !excludeCodes.has(l.code));
  if (!candLeagues.length) return null;
  const dbvals: string[] = []; const codes: string[] = [];
  for (const l of candLeagues) for (const v of l.dbValues) { dbvals.push(v); codes.push(l.code); }
  const { rows } = await pool.query<{ code: string; n1: string; n2: string; n3: string }>(
    `SELECT lg.code,
            count(DISTINCT p.id) FILTER (WHERE pc.club_id = $1) AS n1,
            count(DISTINCT p.id) FILTER (WHERE pc.club_id = $2) AS n2,
            count(DISTINCT p.id) FILTER (WHERE pc.club_id = $3) AS n3
       FROM player_clubs pc
       JOIN players p ON p.id = pc.player_id
       JOIN player_clubs pl ON pl.player_id = p.id
       JOIN clubs cl ON cl.id = pl.club_id
       JOIN (SELECT unnest($5::text[]) AS dbval, unnest($6::text[]) AS code) AS lg ON cl.league = lg.dbval
      WHERE pc.club_id = ANY($4::bigint[])
        AND COALESCE(pc.end_year, pc.start_year, 9999) >= ${MIN_SPELL_YEAR}
        AND ${LEAGUE_SPELL_ACTIVE('pl')}
      GROUP BY lg.code`,
    [clubIds[0], clubIds[1], clubIds[2], clubIds, dbvals, codes],
  );
  const viable = rows
    .map((r) => { const counts: [number, number, number] = [Number(r.n1), Number(r.n2), Number(r.n3)]; return { code: r.code, counts, n: Math.min(...counts) }; })
    .filter((r) => r.n >= min);
  if (!viable.length) return null;
  viable.sort((a, b) => b.n - a.n);
  const top = viable.slice(0, Math.min(3, viable.length));
  const pick = top[Math.floor(Math.random() * top.length)]!;
  return { code: pick.code, name: xoxLeagueDisplay(pick.code), logoUrl: xoxLeagueLogo(pick.code)!, counts: pick.counts };
}

// ── XOX teknik direktör ekseni (2026-08-29) ──────────────────────────────────
// Hücre = kesişen kulüpte oynamış VE bu TD'nin yönettiği bir kulüpte O DÖNEM
// (yıl-örtüşme) oynamış oyuncu. Veri: managers + manager_tenures (TM'den, YALNIZ
// baş antrenör dönemleri). tmClubId = clubs.id doğrudan. "TD altında oynadı"
// yordamı = oyuncunun bir spell'i, TD'nin O kulüpteki döneminin yıl aralığıyla
// örtüşüyor. Açık uçlu (null) end = devam ediyor → şu anki yıla coalesce.
const UNDER_MANAGER_SQL = (mgr: string) => `EXISTS (
  SELECT 1 FROM player_clubs pm
    JOIN manager_tenures mt ON mt.club_id = pm.club_id AND mt.manager_id = ${mgr}
   WHERE pm.player_id = p.id
     AND GREATEST(pm.start_year, mt.start_year) <= LEAST(COALESCE(pm.end_year, EXTRACT(YEAR FROM now())::int), COALESCE(mt.end_year, EXTRACT(YEAR FROM now())::int)))`;

/** Kesişen kulüpte oynamış VE bu TD altında (yıl-örtüşme) oynamış oyuncular. */
export async function getValidPlayersForManagerAndClub(clubId: number, managerId: number, limit = 12): Promise<CountryTeamAnswerCandidate[]> {
  const { rows } = await pool.query<{ id: string; name: string; image_url: string | null; fame: string; career_count: string }>(
    `SELECT p.id, p.name, p.image_url,
            count(DISTINCT pc2.club_id) AS career_count,
            COALESCE(MAX(GREATEST(COALESCE(c2.popularity, 0), (SELECT count(*) FROM player_clubs x WHERE x.club_id = pc2.club_id))), 0) AS fame
       FROM players p
       JOIN player_clubs pc ON pc.player_id = p.id AND pc.club_id = $1
       LEFT JOIN player_clubs pc2 ON pc2.player_id = p.id
       LEFT JOIN clubs c2 ON c2.id = pc2.club_id
      WHERE ${ACTIVE_SPELL_SQL}
        AND ${UNDER_MANAGER_SQL('$2')}
      GROUP BY p.id, p.name, p.image_url
      ORDER BY (p.image_url IS NOT NULL) DESC, fame DESC, career_count DESC, p.name ASC
      LIMIT $3`,
    [clubId, managerId, limit],
  );
  return rows.map((r) => { const fame = Number(r.fame); return { playerId: Number(r.id), canonicalName: r.name, imageUrl: r.image_url, confidence: 1, popularityScore: popularityScoreFromFame(fame), fame }; });
}

export async function topPlayerForManagerAndClub(clubId: number, managerId: number): Promise<{ name: string; imageUrl: string | null } | null> {
  const cands = await getValidPlayersForManagerAndClub(clubId, managerId, 1).catch(() => [] as CountryTeamAnswerCandidate[]);
  const t = cands[0]; return t ? { name: t.canonicalName, imageUrl: t.imageUrl } : null;
}

export async function validateManagerTeamPlayerId(clubId: number, managerId: number, playerId: number): Promise<boolean> {
  if (!Number.isFinite(clubId) || !Number.isFinite(managerId) || !Number.isFinite(playerId)) return false;
  const { rows } = await pool.query<{ id: string }>(
    `SELECT p.id FROM players p
       JOIN player_clubs pc ON pc.player_id = p.id AND pc.club_id = $1
      WHERE p.id = $3 AND ${ACTIVE_SPELL_SQL} AND ${UNDER_MANAGER_SQL('$2')}
      LIMIT 1`,
    [clubId, managerId, playerId],
  );
  return rows.length > 0;
}

export async function verifyManagerTeamGuess(clubId: number, managerId: number, guess: string): Promise<VerifyResult> {
  const club = await getClub(clubId);
  if (!club) throw new Error('Unknown club id');
  const mgr = await pool.query<{ name: string; image_url: string | null }>('SELECT name, image_url FROM managers WHERE id=$1', [managerId]);
  const pseudoMgr: ClubHit = { id: 0, name: mgr.rows[0]?.name ?? 'Teknik Direktör', logoUrl: mgr.rows[0]?.image_url ?? null };
  const norm = normalize(guess);
  const empty: Omit<VerifyResult, 'correct' | 'reason' | 'matchedPlayer'> = { autocorrected: false, teamA: pseudoMgr, teamB: club, spellsA: [], spellsB: [], allClubs: [] };
  if (!norm) return { correct: false, reason: 'no_match', matchedPlayer: null, ...empty };
  const { rows: cands } = await pool.query<{ id: string; name: string; sim: number; image_url: string | null }>(
    `SELECT picked.id, picked.name, picked.image_url, picked.sim FROM (
       SELECT DISTINCT ON (p.id) p.id, p.name, p.image_url,
              word_similarity($1, p.name_norm) AS sim,
              (SELECT count(*) FROM player_clubs c WHERE c.player_id = p.id) AS career_count
         FROM players p
         JOIN player_clubs pc ON pc.player_id = p.id
        WHERE pc.club_id = $2 AND ${ACTIVE_SPELL_SQL} AND ${UNDER_MANAGER_SQL('$3')}
          AND word_similarity($1, p.name_norm) >= $4
        ORDER BY p.id, sim DESC, (p.image_url IS NOT NULL) DESC, career_count DESC
     ) AS picked
     ORDER BY picked.sim DESC, (picked.image_url IS NOT NULL) DESC, picked.career_count DESC LIMIT 15`,
    [norm, clubId, managerId, config.verifyMatchThreshold],
  );
  const eligible = cands.map((c) => ({ id: Number(c.id), name: c.name, sim: Number(c.sim), imageUrl: c.image_url }));
  if (eligible.length === 0) return { correct: false, reason: 'no_match', matchedPlayer: null, ...empty };
  let matched = eligible[0]!; let correct: boolean; let autocorrected = false;
  const exactCluster = eligible.filter((c) => c.sim >= config.verifyExactThreshold);
  if (exactCluster.length > 0) { matched = exactCluster[0]!; correct = true; }
  else if ((eligible[0]!.sim >= AUTOCORRECT_MIN && notAStub(norm, normalize(eligible[0]!.name))) || editAccepts(norm, normalize(eligible[0]!.name)) || vowelDropAccepts(norm, normalize(eligible[0]!.name))) { matched = eligible[0]!; correct = true; autocorrected = true; }
  else { matched = eligible[0]!; correct = false; }
  if (correct) correct = await validateManagerTeamPlayerId(clubId, managerId, matched.id);
  const allClubs = await getPlayerSpells(matched.id);
  const spellsB = allClubs.filter((s) => s.clubId === clubId);
  return { correct, reason: correct ? 'both' : 'not_both', autocorrected, teamA: pseudoMgr, teamB: club, matchedPlayer: { id: matched.id, name: matched.name, sim: matched.sim, imageUrl: matched.imageUrl }, spellsA: [], spellsB, allClubs };
}

/** XOX TD ekseni üretimi: kesişen 3 kulübün HER BİRİYLE ≥min oyuncusu olan bir TD
 * seçer (ad + foto managers'tan). Yoksa null. */
export async function pickXoxManagerForClubs(clubIds: number[], min: number): Promise<{ managerId: number; name: string; photoUrl: string | null; counts: [number, number, number] } | null> {
  if (clubIds.length !== 3) return null;
  const { rows } = await pool.query<{ manager_id: string; name: string; image_url: string | null; n1: string; n2: string; n3: string }>(
    `SELECT mt.manager_id, mgr.name, mgr.image_url,
            count(DISTINCT p.id) FILTER (WHERE pc.club_id = $1) AS n1,
            count(DISTINCT p.id) FILTER (WHERE pc.club_id = $2) AS n2,
            count(DISTINCT p.id) FILTER (WHERE pc.club_id = $3) AS n3
       FROM player_clubs pc
       JOIN players p ON p.id = pc.player_id
       JOIN player_clubs pm ON pm.player_id = p.id
       JOIN manager_tenures mt ON mt.club_id = pm.club_id
         AND GREATEST(pm.start_year, mt.start_year) <= LEAST(COALESCE(pm.end_year, EXTRACT(YEAR FROM now())::int), COALESCE(mt.end_year, EXTRACT(YEAR FROM now())::int))
       JOIN managers mgr ON mgr.id = mt.manager_id
      WHERE pc.club_id = ANY($4::bigint[]) AND ${ACTIVE_SPELL_SQL}
      GROUP BY mt.manager_id, mgr.name, mgr.image_url`,
    [clubIds[0], clubIds[1], clubIds[2], clubIds],
  );
  const viable = rows.map((r) => { const counts: [number, number, number] = [Number(r.n1), Number(r.n2), Number(r.n3)]; return { managerId: Number(r.manager_id), name: r.name, photoUrl: r.image_url, counts, n: Math.min(...counts) }; }).filter((r) => r.n >= min);
  if (!viable.length) return null;
  viable.sort((a, b) => b.n - a.n);
  const top = viable.slice(0, Math.min(4, viable.length));
  const pick = top[Math.floor(Math.random() * top.length)]!;
  return { managerId: pick.managerId, name: pick.name, photoUrl: pick.photoUrl, counts: pick.counts };
}

// ── XOX kupa ekseni (2026-08-29) ─────────────────────────────────────────────
// Hücre = bu kupayı KAZANMIŞ (herhangi bir kulüple) VE kesişen kulüpte oynamış
// oyuncu. Veri: player_honours (TM Erfolge'den; CL/WC/EL). Kullanıcı örneği:
// "hem Şampiyonlar Ligi kazanmış hem bu takımda oynamış".
interface XoxTrophy { code: string; name: string; apiId: number }
const XOX_TROPHIES: XoxTrophy[] = [
  { code: 'CL', name: 'Şampiyonlar Ligi', apiId: 2 }, // UEFA Champions League
  { code: 'WC', name: 'Dünya Kupası',     apiId: 1 }, // FIFA World Cup
  { code: 'EL', name: 'Avrupa Ligi',      apiId: 3 }, // UEFA Europa League
];
const XOX_TROPHY_BY_CODE = new Map(XOX_TROPHIES.map((t) => [t.code, t] as const));
// Görünen ad (BDOR dahil — BDOR trophy PICK havuzunda DEĞİL, ayrı 'bdor' ekseni,
// ama verify/reveal aynı player_honours motorunu comp='BDOR' ile kullanır).
const COMP_DISPLAY: Record<string, string> = { CL: 'Şampiyonlar Ligi', WC: 'Dünya Kupası', EL: 'Avrupa Ligi', BDOR: "Ballon d'Or" };
export function xoxTrophyDisplay(code: string): string { return COMP_DISPLAY[code] ?? XOX_TROPHY_BY_CODE.get(code)?.name ?? code; }
export function xoxTrophyLogo(code: string): string | null {
  const t = XOX_TROPHY_BY_CODE.get(code);
  return t ? `https://media.api-sports.io/football/leagues/${t.apiId}.png` : null;
}
const WON_TROPHY_SQL = (comp: string) => `EXISTS (SELECT 1 FROM player_honours ph WHERE ph.player_id = p.id AND ph.competition = ${comp})`;

/** Bu kupayı kazanmış VE kesişen kulüpte oynamış oyuncular — fame sıralı. */
export async function getValidPlayersForTrophyAndClub(clubId: number, comp: string, limit = 12): Promise<CountryTeamAnswerCandidate[]> {
  const { rows } = await pool.query<{ id: string; name: string; image_url: string | null; fame: string; career_count: string }>(
    `SELECT p.id, p.name, p.image_url,
            count(DISTINCT pc2.club_id) AS career_count,
            COALESCE(MAX(GREATEST(COALESCE(c2.popularity, 0), (SELECT count(*) FROM player_clubs x WHERE x.club_id = pc2.club_id))), 0) AS fame
       FROM players p
       JOIN player_clubs pc ON pc.player_id = p.id AND pc.club_id = $1
       LEFT JOIN player_clubs pc2 ON pc2.player_id = p.id
       LEFT JOIN clubs c2 ON c2.id = pc2.club_id
      WHERE ${ACTIVE_SPELL_SQL} AND ${WON_TROPHY_SQL('$2')}
      GROUP BY p.id, p.name, p.image_url
      ORDER BY (p.image_url IS NOT NULL) DESC, fame DESC, career_count DESC, p.name ASC
      LIMIT $3`,
    [clubId, comp, limit],
  );
  return rows.map((r) => { const fame = Number(r.fame); return { playerId: Number(r.id), canonicalName: r.name, imageUrl: r.image_url, confidence: 1, popularityScore: popularityScoreFromFame(fame), fame }; });
}

export async function topPlayerForTrophyAndClub(clubId: number, comp: string): Promise<{ name: string; imageUrl: string | null } | null> {
  const cands = await getValidPlayersForTrophyAndClub(clubId, comp, 1).catch(() => [] as CountryTeamAnswerCandidate[]);
  const t = cands[0]; return t ? { name: t.canonicalName, imageUrl: t.imageUrl } : null;
}

export async function validateTrophyTeamPlayerId(clubId: number, comp: string, playerId: number): Promise<boolean> {
  if (!Number.isFinite(clubId) || !Number.isFinite(playerId)) return false;
  const { rows } = await pool.query<{ id: string }>(
    `SELECT p.id FROM players p
       JOIN player_clubs pc ON pc.player_id = p.id AND pc.club_id = $1
      WHERE p.id = $3 AND ${ACTIVE_SPELL_SQL} AND ${WON_TROPHY_SQL('$2')}
      LIMIT 1`,
    [clubId, comp, playerId],
  );
  return rows.length > 0;
}

export async function verifyTrophyTeamGuess(clubId: number, comp: string, guess: string): Promise<VerifyResult> {
  const club = await getClub(clubId);
  if (!club) throw new Error('Unknown club id');
  const pseudoTrophy: ClubHit = { id: 0, name: xoxTrophyDisplay(comp), logoUrl: xoxTrophyLogo(comp) };
  const norm = normalize(guess);
  const empty: Omit<VerifyResult, 'correct' | 'reason' | 'matchedPlayer'> = { autocorrected: false, teamA: pseudoTrophy, teamB: club, spellsA: [], spellsB: [], allClubs: [] };
  if (!norm) return { correct: false, reason: 'no_match', matchedPlayer: null, ...empty };
  const { rows: cands } = await pool.query<{ id: string; name: string; sim: number; image_url: string | null }>(
    `SELECT picked.id, picked.name, picked.image_url, picked.sim FROM (
       SELECT DISTINCT ON (p.id) p.id, p.name, p.image_url,
              word_similarity($1, p.name_norm) AS sim,
              (SELECT count(*) FROM player_clubs c WHERE c.player_id = p.id) AS career_count
         FROM players p
         JOIN player_clubs pc ON pc.player_id = p.id
        WHERE pc.club_id = $2 AND ${ACTIVE_SPELL_SQL} AND ${WON_TROPHY_SQL('$3')}
          AND word_similarity($1, p.name_norm) >= $4
        ORDER BY p.id, sim DESC, (p.image_url IS NOT NULL) DESC, career_count DESC
     ) AS picked
     ORDER BY picked.sim DESC, (picked.image_url IS NOT NULL) DESC, picked.career_count DESC LIMIT 15`,
    [norm, clubId, comp, config.verifyMatchThreshold],
  );
  const eligible = cands.map((c) => ({ id: Number(c.id), name: c.name, sim: Number(c.sim), imageUrl: c.image_url }));
  if (eligible.length === 0) return { correct: false, reason: 'no_match', matchedPlayer: null, ...empty };
  let matched = eligible[0]!; let correct: boolean; let autocorrected = false;
  const exactCluster = eligible.filter((c) => c.sim >= config.verifyExactThreshold);
  if (exactCluster.length > 0) { matched = exactCluster[0]!; correct = true; }
  else if ((eligible[0]!.sim >= AUTOCORRECT_MIN && notAStub(norm, normalize(eligible[0]!.name))) || editAccepts(norm, normalize(eligible[0]!.name)) || vowelDropAccepts(norm, normalize(eligible[0]!.name))) { matched = eligible[0]!; correct = true; autocorrected = true; }
  else { matched = eligible[0]!; correct = false; }
  if (correct) correct = await validateTrophyTeamPlayerId(clubId, comp, matched.id);
  const allClubs = await getPlayerSpells(matched.id);
  const spellsB = allClubs.filter((s) => s.clubId === clubId);
  return { correct, reason: correct ? 'both' : 'not_both', autocorrected, teamA: pseudoTrophy, teamB: club, matchedPlayer: { id: matched.id, name: matched.name, sim: matched.sim, imageUrl: matched.imageUrl }, spellsA: [], spellsB, allClubs };
}

/** XOX kupa ekseni üretimi: kesişen 3 kulübün HER BİRİYLE ≥min oyuncusu olan bir
 * kupa seçer (CL/WC/EL). Yoksa null. */
export async function pickXoxTrophyForClubs(clubIds: number[], min: number): Promise<{ code: string; name: string; logoUrl: string; counts: [number, number, number] } | null> {
  if (clubIds.length !== 3) return null;
  const { rows } = await pool.query<{ competition: string; n1: string; n2: string; n3: string }>(
    `SELECT ph.competition,
            count(DISTINCT p.id) FILTER (WHERE pc.club_id = $1) AS n1,
            count(DISTINCT p.id) FILTER (WHERE pc.club_id = $2) AS n2,
            count(DISTINCT p.id) FILTER (WHERE pc.club_id = $3) AS n3
       FROM player_clubs pc
       JOIN players p ON p.id = pc.player_id
       JOIN player_honours ph ON ph.player_id = p.id
      WHERE pc.club_id = ANY($4::bigint[]) AND ${ACTIVE_SPELL_SQL}
      GROUP BY ph.competition`,
    [clubIds[0], clubIds[1], clubIds[2], clubIds],
  );
  const viable = rows.map((r) => { const counts: [number, number, number] = [Number(r.n1), Number(r.n2), Number(r.n3)]; return { code: r.competition, counts, n: Math.min(...counts) }; }).filter((r) => r.n >= min && XOX_TROPHY_BY_CODE.has(r.code));
  if (!viable.length) return null;
  viable.sort((a, b) => b.n - a.n);
  const top = viable.slice(0, Math.min(3, viable.length));
  const pick = top[Math.floor(Math.random() * top.length)]!;
  return { code: pick.code, name: xoxTrophyDisplay(pick.code), logoUrl: xoxTrophyLogo(pick.code)!, counts: pick.counts };
}

// ── XOX Ballon d'Or ekseni (2026-08-30) ──────────────────────────────────────
// player_honours competition='BDOR'. Verify/reveal, kupa motorunu comp='BDOR' ile
// yeniden kullanır (verifyTrophyTeamGuess / getValidPlayersForTrophyAndClub).
// BDOR nadir (az kazanan) → yalnız çok büyük kulüplerde uygun olur.
export async function pickXoxBdorForClubs(clubIds: number[], min: number): Promise<{ counts: [number, number, number] } | null> {
  if (clubIds.length !== 3) return null;
  const { rows } = await pool.query<{ n1: string; n2: string; n3: string }>(
    `SELECT count(DISTINCT p.id) FILTER (WHERE pc.club_id = $1) AS n1,
            count(DISTINCT p.id) FILTER (WHERE pc.club_id = $2) AS n2,
            count(DISTINCT p.id) FILTER (WHERE pc.club_id = $3) AS n3
       FROM player_clubs pc
       JOIN players p ON p.id = pc.player_id
       JOIN player_honours ph ON ph.player_id = p.id AND ph.competition = 'BDOR'
      WHERE pc.club_id = ANY($4::bigint[]) AND ${ACTIVE_SPELL_SQL}`,
    [clubIds[0], clubIds[1], clubIds[2], clubIds],
  );
  const r = rows[0]; if (!r) return null;
  const counts: [number, number, number] = [Number(r.n1), Number(r.n2), Number(r.n3)];
  return Math.min(...counts) >= min ? { counts } : null;
}

// ── XOX mevki ekseni (2026-08-30) ────────────────────────────────────────────
// KATI: oyuncunun ANA mevkisi (player_positions, tek satır) = eksen kodu. Hücre =
// ana mevkisi O olan VE kesişen kulüpte oynamış oyuncu — asıl yeri orası olmayan
// oyuncu ASLA kabul edilmez.
const XOX_POS_LABEL: Record<string, string> = {
  GK: 'KALECİ', CB: 'STOPER', RB: 'SAĞ BEK', LB: 'SOL BEK',
  MF: 'ORTA SAHA', LW: 'SOL KANAT', RW: 'SAĞ KANAT', ST: 'SANTRAFOR',
};
export function xoxPositionLabel(code: string): string { return XOX_POS_LABEL[code] ?? code; }
const HAS_POSITION_SQL = (pos: string) => `EXISTS (SELECT 1 FROM player_positions pp WHERE pp.player_id = p.id AND pp.position = ${pos})`;

/** Kesişen kulüpte oynamış VE ANA mevkisi = code olan oyuncular — fame sıralı. */
export async function getValidPlayersForPositionAndClub(clubId: number, code: string, limit = 12): Promise<CountryTeamAnswerCandidate[]> {
  const { rows } = await pool.query<{ id: string; name: string; image_url: string | null; fame: string; career_count: string }>(
    `SELECT p.id, p.name, p.image_url,
            count(DISTINCT pc2.club_id) AS career_count,
            COALESCE(MAX(GREATEST(COALESCE(c2.popularity, 0), (SELECT count(*) FROM player_clubs x WHERE x.club_id = pc2.club_id))), 0) AS fame
       FROM players p
       JOIN player_clubs pc ON pc.player_id = p.id AND pc.club_id = $1
       JOIN player_positions pp ON pp.player_id = p.id AND pp.position = $2
       LEFT JOIN player_clubs pc2 ON pc2.player_id = p.id
       LEFT JOIN clubs c2 ON c2.id = pc2.club_id
      WHERE ${ACTIVE_SPELL_SQL}
      GROUP BY p.id, p.name, p.image_url
      ORDER BY (p.image_url IS NOT NULL) DESC, fame DESC, career_count DESC, p.name ASC
      LIMIT $3`,
    [clubId, code, limit],
  );
  return rows.map((r) => { const fame = Number(r.fame); return { playerId: Number(r.id), canonicalName: r.name, imageUrl: r.image_url, confidence: 1, popularityScore: popularityScoreFromFame(fame), fame }; });
}

export async function topPlayerForPositionAndClub(clubId: number, code: string): Promise<{ name: string; imageUrl: string | null } | null> {
  const cands = await getValidPlayersForPositionAndClub(clubId, code, 1).catch(() => [] as CountryTeamAnswerCandidate[]);
  const t = cands[0]; return t ? { name: t.canonicalName, imageUrl: t.imageUrl } : null;
}

export async function validatePositionTeamPlayerId(clubId: number, code: string, playerId: number): Promise<boolean> {
  if (!Number.isFinite(clubId) || !Number.isFinite(playerId)) return false;
  const { rows } = await pool.query<{ id: string }>(
    `SELECT p.id FROM players p
       JOIN player_clubs pc ON pc.player_id = p.id AND pc.club_id = $1
       JOIN player_positions pp ON pp.player_id = p.id AND pp.position = $2
      WHERE p.id = $3 AND ${ACTIVE_SPELL_SQL}
      LIMIT 1`,
    [clubId, code, playerId],
  );
  return rows.length > 0;
}

export async function verifyPositionTeamGuess(clubId: number, code: string, guess: string): Promise<VerifyResult> {
  const club = await getClub(clubId);
  if (!club) throw new Error('Unknown club id');
  const pseudoPos: ClubHit = { id: 0, name: xoxPositionLabel(code), logoUrl: null };
  const norm = normalize(guess);
  const empty: Omit<VerifyResult, 'correct' | 'reason' | 'matchedPlayer'> = { autocorrected: false, teamA: pseudoPos, teamB: club, spellsA: [], spellsB: [], allClubs: [] };
  if (!norm) return { correct: false, reason: 'no_match', matchedPlayer: null, ...empty };
  const { rows: cands } = await pool.query<{ id: string; name: string; sim: number; image_url: string | null }>(
    `SELECT picked.id, picked.name, picked.image_url, picked.sim FROM (
       SELECT DISTINCT ON (p.id) p.id, p.name, p.image_url,
              word_similarity($1, p.name_norm) AS sim,
              (SELECT count(*) FROM player_clubs c WHERE c.player_id = p.id) AS career_count
         FROM players p
         JOIN player_clubs pc ON pc.player_id = p.id
         JOIN player_positions pp ON pp.player_id = p.id AND pp.position = $3
        WHERE pc.club_id = $2 AND ${ACTIVE_SPELL_SQL}
          AND word_similarity($1, p.name_norm) >= $4
        ORDER BY p.id, sim DESC, (p.image_url IS NOT NULL) DESC, career_count DESC
     ) AS picked
     ORDER BY picked.sim DESC, (picked.image_url IS NOT NULL) DESC, picked.career_count DESC LIMIT 15`,
    [norm, clubId, code, config.verifyMatchThreshold],
  );
  const eligible = cands.map((c) => ({ id: Number(c.id), name: c.name, sim: Number(c.sim), imageUrl: c.image_url }));
  if (eligible.length === 0) return { correct: false, reason: 'no_match', matchedPlayer: null, ...empty };
  let matched = eligible[0]!; let correct: boolean; let autocorrected = false;
  const exactCluster = eligible.filter((c) => c.sim >= config.verifyExactThreshold);
  if (exactCluster.length > 0) { matched = exactCluster[0]!; correct = true; }
  else if ((eligible[0]!.sim >= AUTOCORRECT_MIN && notAStub(norm, normalize(eligible[0]!.name))) || editAccepts(norm, normalize(eligible[0]!.name)) || vowelDropAccepts(norm, normalize(eligible[0]!.name))) { matched = eligible[0]!; correct = true; autocorrected = true; }
  else { matched = eligible[0]!; correct = false; }
  if (correct) correct = await validatePositionTeamPlayerId(clubId, code, matched.id);
  const allClubs = await getPlayerSpells(matched.id);
  const spellsB = allClubs.filter((s) => s.clubId === clubId);
  return { correct, reason: correct ? 'both' : 'not_both', autocorrected, teamA: pseudoPos, teamB: club, matchedPlayer: { id: matched.id, name: matched.name, sim: matched.sim, imageUrl: matched.imageUrl }, spellsA: [], spellsB, allClubs };
}

/** XOX mevki ekseni üretimi: 3 kulübün HER BİRİYLE ≥min oyuncusu (o ana mevkide)
 * olan bir mevki seçer. Yoksa null. */
export async function pickXoxPositionForClubs(clubIds: number[], min: number): Promise<{ code: string; label: string; counts: [number, number, number] } | null> {
  if (clubIds.length !== 3) return null;
  const { rows } = await pool.query<{ position: string; n1: string; n2: string; n3: string }>(
    `SELECT pp.position,
            count(DISTINCT p.id) FILTER (WHERE pc.club_id = $1) AS n1,
            count(DISTINCT p.id) FILTER (WHERE pc.club_id = $2) AS n2,
            count(DISTINCT p.id) FILTER (WHERE pc.club_id = $3) AS n3
       FROM player_clubs pc
       JOIN players p ON p.id = pc.player_id
       JOIN player_positions pp ON pp.player_id = p.id
      WHERE pc.club_id = ANY($4::bigint[]) AND ${ACTIVE_SPELL_SQL}
      GROUP BY pp.position`,
    [clubIds[0], clubIds[1], clubIds[2], clubIds],
  );
  const viable = rows.map((r) => { const counts: [number, number, number] = [Number(r.n1), Number(r.n2), Number(r.n3)]; return { code: r.position, counts, n: Math.min(...counts) }; }).filter((r) => r.n >= min && XOX_POS_LABEL[r.code]);
  if (!viable.length) return null;
  viable.sort((a, b) => b.n - a.n);
  const top = viable.slice(0, Math.min(4, viable.length));
  const pick = top[Math.floor(Math.random() * top.length)]!;
  return { code: pick.code, label: xoxPositionLabel(pick.code), counts: pick.counts };
}

// ═══════════════════════════════════════════════════════════════════════════
// XOX BİRLEŞİK LOGO (COMBO) EKSENİ + BİRLEŞİK HÜCRE MOTORU (2026-08-30)
// ───────────────────────────────────────────────────────────────────────────
// Combo: iki takımın birleşik logosu. Hücre = O İKİ takımda DA oynamış (+ diğer
// eksen şartını sağlayan) oyuncu. Ör. Barça+Real × Galatasaray → Hagi.
//
// KARIŞIK DİZİLİM: artık özeller İKİ eksene de gelebilir → özel×özel hücreler
// mümkün. Bunu HATASIZ yapmak için TÜM eksen türlerini tek bir "player predикату"
// modeline indirgeyen birleşik motor: countXoxCell / xoxCellValidPlayers /
// topPlayerForXoxCell / verifyXoxCellGuess. Her eksen p.id üzerinde bir EXISTS/
// koşula çevrilir; hücre = predA AND predB. Kulüp koşulu mevcut club×special
// motorlarıyla BİREBİR aynı SQL parçalarını kullanır → yeni hata yüzeyi yok.
// ═══════════════════════════════════════════════════════════════════════════
export interface XoxCombo { key: string; name: string; a: number; b: number }
export const XOX_COMBOS: XoxCombo[] = [
  { key: 'BARCA_REAL',      name: 'Barça + Real',      a: 131, b: 418 },
  { key: 'BAYERN_DORTMUND', name: 'Bayern + Dortmund', a: 27,  b: 16  },
  { key: 'CITY_UNITED',     name: 'City + United',     a: 281, b: 985 },
];
const XOX_COMBO_BY_KEY = new Map(XOX_COMBOS.map((c) => [c.key, c] as const));
export function xoxComboName(key: string): string { return XOX_COMBO_BY_KEY.get(key)?.name ?? key; }
export function xoxComboClubs(key: string): [number, number] | null {
  const c = XOX_COMBO_BY_KEY.get(key); return c ? [c.a, c.b] : null;
}

/** XOX combo ekseni üretimi: verilen 3 kulübün HER BİRİYLE, o combo'nun İKİ
 * takımında DA oynamış ≥min oyuncusu olan bir combo seçer. Combo'nun kendi
 * takımları opposing kulüpler arasındaysa o combo elenir (trivial hücre olmasın).
 * counts = opposing kulüp sırasına göre. Yoksa null. */
export async function pickXoxComboForClubs(
  clubIds: number[], min: number, rnd: () => number = Math.random,
): Promise<{ key: string; name: string; a: number; b: number; counts: [number, number, number] } | null> {
  if (clubIds.length !== 3) return null;
  const shuffled = [...XOX_COMBOS].sort(() => rnd() - 0.5);
  for (const combo of shuffled) {
    if (clubIds.includes(combo.a) || clubIds.includes(combo.b)) continue; // trivial/degenerate
    const { rows } = await pool.query<{ n1: string; n2: string; n3: string }>(
      `SELECT count(DISTINCT p.id) FILTER (WHERE pc.club_id = $1) AS n1,
              count(DISTINCT p.id) FILTER (WHERE pc.club_id = $2) AS n2,
              count(DISTINCT p.id) FILTER (WHERE pc.club_id = $3) AS n3
         FROM player_clubs pc
         JOIN players p ON p.id = pc.player_id
        WHERE pc.club_id = ANY($4::bigint[]) AND ${ACTIVE_SPELL_SQL}
          AND EXISTS (SELECT 1 FROM player_clubs a WHERE a.player_id = p.id AND a.club_id = $5)
          AND EXISTS (SELECT 1 FROM player_clubs b WHERE b.player_id = p.id AND b.club_id = $6)`,
      [clubIds[0], clubIds[1], clubIds[2], clubIds, combo.a, combo.b],
    );
    const r = rows[0]; if (!r) continue;
    const counts: [number, number, number] = [Number(r.n1), Number(r.n2), Number(r.n3)];
    if (Math.min(...counts) >= min) return { key: combo.key, name: combo.name, a: combo.a, b: combo.b, counts };
  }
  return null;
}

/** Bir XOX hücre ekseni — birleşik motorun anladığı normalize biçim. */
export type XoxCellAxis =
  | { kind: 'club'; id: number }
  | { kind: 'combo'; comboA: number; comboB: number }
  | { kind: 'country'; country: string }
  | { kind: 'league'; league: string }
  | { kind: 'manager'; manager: number }
  | { kind: 'trophy'; trophy: string }
  | { kind: 'bdor' }
  | { kind: 'position'; position: string };

/** ClubRef/XoxAxis benzeri bir eksen nesnesini birleşik motor eksenine çevirir
 * (room/bot/grid ortak kullanır). kind yoksa/kulüpse → club. */
export function toXoxCellAxis(ref: {
  kind?: string; id: number; country?: string; league?: string; manager?: number;
  trophy?: string; position?: string; comboA?: number; comboB?: number;
}): XoxCellAxis {
  switch (ref.kind) {
    case 'combo': return { kind: 'combo', comboA: ref.comboA!, comboB: ref.comboB! };
    case 'country': return { kind: 'country', country: ref.country! };
    case 'league': return { kind: 'league', league: ref.league! };
    case 'manager': return { kind: 'manager', manager: ref.manager! };
    case 'trophy': return { kind: 'trophy', trophy: ref.trophy! };
    case 'bdor': return { kind: 'bdor' };
    case 'position': return { kind: 'position', position: ref.position! };
    default: return { kind: 'club', id: ref.id };
  }
}

/** Aktif kulüp spell koşulu (ACTIVE_SPELL_SQL ile aynı, ama verilen alias için). */
const CLUB_SPELL_SQL = (alias: string, param: number) =>
  `EXISTS (SELECT 1 FROM player_clubs ${alias} WHERE ${alias}.player_id = p.id AND ${alias}.club_id = $${param}`
  + ` AND COALESCE(${alias}.end_year, ${alias}.start_year, 9999) >= ${MIN_SPELL_YEAR})`;

/** Bir ekseni p.id üzerinde bir boolean SQL koşuluna çevirir; parametreleri
 * paylaşılan `params` dizisine ekler. Kulüp/lig/TD/kupa/mevki koşulları mevcut
 * motorlarla AYNI (tek fark: alias'lar çakışmasın diye türe özgü). */
function xoxAxisSql(axis: XoxCellAxis, params: unknown[]): string {
  switch (axis.kind) {
    case 'club':
      params.push(axis.id);
      return CLUB_SPELL_SQL('pcx', params.length);
    case 'combo': {
      params.push(axis.comboA); const a = params.length;
      params.push(axis.comboB); const b = params.length;
      return `(${CLUB_SPELL_SQL('pca', a)} AND ${CLUB_SPELL_SQL('pcb', b)})`;
    }
    case 'country':
      params.push(nationalityVariants(axis.country));
      return `p.nationality = ANY($${params.length})`;
    case 'league':
      params.push(leagueDbValues(axis.league));
      return `EXISTS (SELECT 1 FROM player_clubs pl JOIN clubs cl ON cl.id = pl.club_id`
        + ` WHERE pl.player_id = p.id AND cl.league = ANY($${params.length}) AND ${LEAGUE_SPELL_ACTIVE('pl')})`;
    case 'manager':
      params.push(axis.manager);
      return UNDER_MANAGER_SQL(`$${params.length}`);
    case 'trophy':
      params.push(axis.trophy);
      return WON_TROPHY_SQL(`$${params.length}`);
    case 'bdor':
      return WON_TROPHY_SQL(`'BDOR'`);
    case 'position':
      params.push(axis.position);
      return HAS_POSITION_SQL(`$${params.length}`);
  }
}

/** Hücrede kaç geçerli cevap var (cap ile sınırlı — ≥min testi için ucuz). */
export async function countXoxCell(a: XoxCellAxis, b: XoxCellAxis, cap = 12): Promise<number> {
  const params: unknown[] = [];
  const sa = xoxAxisSql(a, params);
  const sb = xoxAxisSql(b, params);
  const { rows } = await pool.query<{ n: string }>(
    `SELECT count(*)::int AS n FROM (SELECT 1 FROM players p WHERE ${sa} AND ${sb} LIMIT ${Math.max(1, Math.floor(cap))}) t`,
    params,
  );
  return Number(rows[0]?.n ?? 0);
}

/** Hücrenin geçerli cevapları (fame sıralı) — reveal + bot + adversarial için. */
export async function xoxCellValidPlayers(a: XoxCellAxis, b: XoxCellAxis, limit = 12): Promise<CountryTeamAnswerCandidate[]> {
  const params: unknown[] = [];
  const sa = xoxAxisSql(a, params);
  const sb = xoxAxisSql(b, params);
  params.push(limit); const lim = params.length;
  // Sıralama PRESTİJE göre (kariyer boyu oynanan kulüplerin ÜN toplamı) → reveal +
  // bot "EN BİLİNDİK oyuncu"yu seçer. fame (kadro ölçeği) bot zorluğu için korunur.
  const { rows } = await pool.query<{ id: string; name: string; image_url: string | null; fame: string; career_count: string; prestige: string }>(
    `SELECT p.id, p.name, p.image_url,
            count(DISTINCT pc2.club_id) AS career_count,
            COALESCE(MAX(GREATEST(COALESCE(c2.popularity, 0), (SELECT count(*) FROM player_clubs x WHERE x.club_id = pc2.club_id))), 0) AS fame,
            COALESCE((SELECT SUM(cl.prestige) FROM (SELECT DISTINCT club_id FROM player_clubs WHERE player_id = p.id) d
                        JOIN clubs cl ON cl.id = d.club_id), 0) AS prestige
       FROM players p
       LEFT JOIN player_clubs pc2 ON pc2.player_id = p.id
       LEFT JOIN clubs c2 ON c2.id = pc2.club_id
      WHERE ${sa} AND ${sb}
      GROUP BY p.id, p.name, p.image_url
      ORDER BY (p.image_url IS NOT NULL) DESC, prestige DESC, fame DESC, career_count DESC, p.name ASC
      LIMIT $${lim}`,
    params,
  );
  return rows.map((r) => {
    const fame = Number(r.fame);
    return { playerId: Number(r.id), canonicalName: r.name, imageUrl: r.image_url, confidence: 1, popularityScore: popularityScoreFromFame(fame), fame };
  });
}

/** Boş-hücre reveal + botun "bildiği" cevap: hücrenin EN ÜNLÜ geçerli oyuncusu. */
export async function topPlayerForXoxCell(a: XoxCellAxis, b: XoxCellAxis): Promise<{ name: string; imageUrl: string | null } | null> {
  const cands = await xoxCellValidPlayers(a, b, 1).catch(() => [] as CountryTeamAnswerCandidate[]);
  const t = cands[0];
  return t ? { name: t.canonicalName, imageUrl: t.imageUrl } : null;
}

/** Birleşik XOX hücre doğrulaması — HER eksen kombinasyonu (kulüp×özel, özel×özel,
 * combo×…) için tek motor. Ad araması predA∧predB ile SINIRLI → yanlış cevap
 * (bir şartı sağlamayan oyuncu) zaten sonuç kümesinde yok = reddedilir. */
export async function verifyXoxCellGuess(a: XoxCellAxis, b: XoxCellAxis, refA: ClubHit, refB: ClubHit, guess: string): Promise<VerifyResult> {
  const norm = normalize(guess);
  const empty: Omit<VerifyResult, 'correct' | 'reason' | 'matchedPlayer'> = {
    autocorrected: false, teamA: refA, teamB: refB, spellsA: [], spellsB: [], allClubs: [],
  };
  if (!norm) return { correct: false, reason: 'no_match', matchedPlayer: null, ...empty };
  const params: unknown[] = [norm];
  const sa = xoxAxisSql(a, params);
  const sb = xoxAxisSql(b, params);
  params.push(config.verifyMatchThreshold); const thr = params.length;
  const { rows: cands } = await pool.query<{ id: string; name: string; sim: number; image_url: string | null }>(
    `SELECT picked.id, picked.name, picked.image_url, picked.sim FROM (
       SELECT DISTINCT ON (p.id) p.id, p.name, p.image_url,
              word_similarity($1, p.name_norm) AS sim,
              (SELECT count(*) FROM player_clubs c WHERE c.player_id = p.id) AS career_count
         FROM players p
        WHERE ${sa} AND ${sb}
          AND word_similarity($1, p.name_norm) >= $${thr}
        ORDER BY p.id, sim DESC, (p.image_url IS NOT NULL) DESC, career_count DESC
     ) AS picked
     ORDER BY picked.sim DESC, (picked.image_url IS NOT NULL) DESC, picked.career_count DESC LIMIT 15`,
    params,
  );
  const eligible = cands.map((c) => ({ id: Number(c.id), name: c.name, sim: Number(c.sim), imageUrl: c.image_url }));
  if (eligible.length === 0) return { correct: false, reason: 'no_match', matchedPlayer: null, ...empty };
  let matched = eligible[0]!; let correct: boolean; let autocorrected = false;
  const exactCluster = eligible.filter((c) => c.sim >= config.verifyExactThreshold);
  if (exactCluster.length > 0) { matched = exactCluster[0]!; correct = true; }
  else if ((eligible[0]!.sim >= AUTOCORRECT_MIN && notAStub(norm, normalize(eligible[0]!.name)))
    || editAccepts(norm, normalize(eligible[0]!.name)) || vowelDropAccepts(norm, normalize(eligible[0]!.name))) {
    matched = eligible[0]!; correct = true; autocorrected = true;
  } else { matched = eligible[0]!; correct = false; }
  // Ad araması zaten predA∧predB ile sınırlı; eşleşen kişi iki şartı da sağlar.
  const allClubs = await getPlayerSpells(matched.id).catch(() => [] as SpellInfo[]);
  return {
    correct, reason: correct ? 'both' : 'not_both', autocorrected, teamA: refA, teamB: refB,
    matchedPlayer: { id: matched.id, name: matched.name, sim: matched.sim, imageUrl: matched.imageUrl },
    spellsA: [], spellsB: [], allClubs,
  };
}

export async function validateCountryTeamPlayerId(
  clubId: number,
  country: string,
  playerId: number,
): Promise<{ valid: boolean; player: CountryTeamAnswerCandidate | null }> {
  if (!Number.isFinite(clubId) || !Number.isFinite(playerId) || !country.trim()) {
    return { valid: false, player: null };
  }
  const countries = nationalityVariants(country);
  const { rows } = await pool.query<{ id: string; name: string; image_url: string | null; fame: string }>(
    `SELECT p.id,
            p.name,
            p.image_url,
            COALESCE(MAX(GREATEST(COALESCE(c2.popularity, 0), (SELECT count(*) FROM player_clubs x WHERE x.club_id = pc2.club_id))), 0) AS fame
       FROM players p
       JOIN player_clubs pc ON pc.player_id = p.id AND pc.club_id = $1
       JOIN clubs c ON c.id = pc.club_id AND c.is_national = false
       LEFT JOIN player_clubs pc2 ON pc2.player_id = p.id
       LEFT JOIN clubs c2 ON c2.id = pc2.club_id
      WHERE p.id = $3
        AND ${ACTIVE_SPELL_SQL}
        AND p.nationality = ANY($2)
      GROUP BY p.id, p.name, p.image_url
      LIMIT 1`,
    [clubId, countries, playerId],
  );
  const r = rows[0];
  if (!r) return { valid: false, player: null };
  const fame = Number(r.fame);
  return {
    valid: true,
    player: {
      playerId: Number(r.id),
      canonicalName: r.name,
      imageUrl: r.image_url,
      confidence: 1,
      popularityScore: popularityScoreFromFame(fame),
      fame,
    },
  };
}

export async function countryTeamAnswerStats(clubId: number, country: string): Promise<{ count: number; fame: number }> {
  const countries = nationalityVariants(country);
  const { rows } = await pool.query<{ count: string; fame: string }>(
    `SELECT count(DISTINCT p.id) AS count,
            COALESCE(MAX(GREATEST(COALESCE(c2.popularity, 0), (SELECT count(*) FROM player_clubs x WHERE x.club_id = pc2.club_id))), 0) AS fame
       FROM players p
       JOIN player_clubs pc ON pc.player_id = p.id AND pc.club_id = $1
       JOIN clubs c ON c.id = pc.club_id AND c.is_national = false
       JOIN player_clubs pc2 ON pc2.player_id = p.id
       JOIN clubs c2 ON c2.id = pc2.club_id
      WHERE ${ACTIVE_SPELL_SQL}
        AND p.nationality = ANY($2)`,
    [clubId, countries],
  );
  return { count: Number(rows[0]?.count ?? 0), fame: Number(rows[0]?.fame ?? 0) };
}

export async function plausibleWrongPlayersCountryTeam(clubId: number, country: string, limit = 16): Promise<string[]> {
  const countries = nationalityVariants(country);
  const { rows } = await pool.query<{ name: string }>(
    `WITH cands AS (
       SELECT DISTINCT p.id, p.name, p.image_url,
              CASE WHEN pc.club_id = $1 THEN 1 ELSE 0 END AS club_side,
              (SELECT count(*) FROM player_clubs c WHERE c.player_id = p.id) AS career_count
         FROM players p
         JOIN player_clubs pc ON pc.player_id = p.id
        WHERE (pc.club_id = $1 OR p.nationality = ANY($2))
          AND NOT (pc.club_id = $1 AND p.nationality = ANY($2))
     )
     SELECT name FROM cands
      ORDER BY club_side DESC, (image_url IS NOT NULL) DESC, career_count DESC, random()
      LIMIT $3`,
    [clubId, countries, limit],
  );
  return rows.map((r) => r.name);
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
      -- EN BİLİNDİK önce (2026-08-28) — harf-takım 'diğer oyuncular'.
      ORDER BY (p.image_url IS NOT NULL) DESC,
               (SELECT MAX(GREATEST(COALESCE(fc.popularity, 0), (SELECT count(*) FROM player_clubs x WHERE x.club_id = fpc.club_id)))
                  FROM player_clubs fpc JOIN clubs fc ON fc.id = fpc.club_id
                 WHERE fpc.player_id = p.id) DESC NULLS LAST
      LIMIT $3`,
    [clubId, prefix, limit],
  );
  return rows.map((r) => ({ name: r.name, imageUrl: r.image_url }));
}

export async function plausibleWrongPlayersLetterTeam(clubId: number, letter: string, limit = 16): Promise<string[]> {
  const prefix = letter.toLowerCase();
  const { rows } = await pool.query<{ name: string }>(
    `SELECT p.name
       FROM players p
       JOIN player_clubs pc ON pc.player_id = p.id
      WHERE pc.club_id = $1
        AND NOT (p.name_norm LIKE $2 || '%' OR p.name_norm LIKE '% ' || $2 || '%')
      GROUP BY p.id, p.name
      ORDER BY (max(p.image_url) IS NOT NULL) DESC,
               (SELECT count(*) FROM player_clubs c WHERE c.player_id = p.id) DESC,
               random()
      LIMIT $3`,
    [clubId, prefix, limit],
  );
  return rows.map((r) => r.name);
}

/** Are there any valid players for a country-team combination? */
export async function hasPlayersCountryTeam(clubId: number, country: string): Promise<boolean> {
  const countries = nationalityVariants(country);
  const { rows } = await pool.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM players p
         JOIN player_clubs pc ON pc.player_id = p.id AND pc.club_id = $1
         JOIN clubs c ON c.id = pc.club_id AND c.is_national = false
        WHERE ${ACTIVE_SPELL_SQL}
          AND p.nationality = ANY($2)
     ) AS ok`,
    [clubId, countries],
  );
  return rows[0]?.ok === true;
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
    const { rows } = await pool.query<{ nationality: string; n: string }>(
      `SELECT p.nationality, count(DISTINCT p.id) AS n FROM player_clubs pc
         JOIN players p ON p.id = pc.player_id
         JOIN clubs c ON c.id = pc.club_id AND c.is_national = false
        WHERE pc.club_id = $1
          AND ${ACTIVE_SPELL_SQL}
          AND p.nationality IS NOT NULL
          AND lower(p.nationality) <> ALL($2::text[])
        GROUP BY p.nationality
        ORDER BY (CASE WHEN p.nationality = ANY($3::text[]) THEN 0 ELSE 1 END), n DESC, random()
        LIMIT 8`,
      [clubId, excl, HUMANLIKE_COUNTRIES],
    );
    if (rows[0]) {
      const top = rows.slice(0, Math.min(5, rows.length));
      return top[Math.floor(Math.random() * top.length)]!.nationality;
    }
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
  const countries = nationalityVariants(country);
  const { rows } = await pool.query<{ id: string; name: string; logo_url: string | null; pop: string }>(
    `SELECT c.id, c.name, c.logo_url,
            COALESCE(NULLIF(c.popularity, 0), (SELECT COUNT(*) FROM player_clubs pc2 WHERE pc2.club_id = c.id)) AS pop
       FROM clubs c
       JOIN player_clubs pc ON pc.club_id = c.id
       JOIN players p ON p.id = pc.player_id
      WHERE p.nationality = ANY($1)
        AND ${ACTIVE_SPELL_SQL}
        AND c.is_national = false
        AND c.logo_url IS NOT NULL
        ${A_TEAM_ONLY}
        AND c.id <> ALL($2::bigint[])
      GROUP BY c.id, c.name, c.logo_url
       ORDER BY pop DESC, random()
       LIMIT 14`,
    [countries, excl],
  );
  const r = pickWeightedClub(rows.map((row) => ({ ...row, pop: Number(row.pop) || 1 })));
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

  const countries = nationalityVariants(country);

  // Fuzzy candidates among players who played for the club AND have the nationality
  const { rows: cands } = await pool.query<{ id: string; name: string; sim: number; image_url: string | null }>(
    `SELECT picked.id, picked.name, picked.image_url, picked.sim
       FROM (
         SELECT DISTINCT ON (p.id)
                p.id,
                p.name,
                p.image_url,
                word_similarity($1, p.name_norm) AS sim,
                (SELECT count(*) FROM player_clubs c WHERE c.player_id = p.id) AS career_count
           FROM players p
           JOIN player_clubs pc ON pc.player_id = p.id
          WHERE pc.club_id = $2
            AND ${ACTIVE_SPELL_SQL}
            AND p.nationality = ANY($3)
            AND word_similarity($1, p.name_norm) >= $4
          ORDER BY p.id, sim DESC, (p.image_url IS NOT NULL) DESC, career_count DESC
       ) AS picked
      ORDER BY picked.sim DESC,
               (picked.image_url IS NOT NULL) DESC,
               picked.career_count DESC
      LIMIT 15`,
    [norm, clubId, countries, config.verifyMatchThreshold],
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
  } else if (
    (eligible[0]!.sim >= AUTOCORRECT_MIN && notAStub(norm, normalize(eligible[0]!.name)))
    || editAccepts(norm, normalize(eligible[0]!.name))
    || vowelDropAccepts(norm, normalize(eligible[0]!.name))
  ) {
    // close typo of a valid answer (trigram / edit-distance / vowel-drop) → accept
    matched = eligible[0]!;
    correct = true;
    autocorrected = true;
  } else {
    // loose/garbage match → not accepted
    matched = eligible[0]!;
    correct = false;
  }

  if (correct) {
    const idCheck = await validateCountryTeamPlayerId(clubId, country, matched.id);
    correct = idCheck.valid;
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
    if (((matched.sim >= AUTOCORRECT_MIN || editAccepts(norm, matchedNorm)) && norm.length >= 4 && norm.length >= matchedNorm.length * 0.5)
      || vowelDropAccepts(norm, matchedNorm)) {
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
  return r ? clubHitFromRow(r) : null;
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
    clubName: clubDisplayName(Number(r.club_id), r.club_name),
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

  const { rows: allBothRows } = await pool.query<{ id: string; name: string; name_norm: string; image_url: string | null; fame: string }>(
    `SELECT p.id, p.name, p.name_norm, p.image_url,
            MAX(GREATEST(COALESCE(c.popularity, 0),
                         (SELECT count(*) FROM player_clubs x WHERE x.club_id = pc.club_id))) AS fame
       FROM players p
       JOIN player_clubs a ON a.player_id = p.id AND a.club_id = $1
       JOIN player_clubs b ON b.player_id = p.id AND b.club_id = $2
       JOIN player_clubs pc ON pc.player_id = p.id
       JOIN clubs c ON c.id = pc.club_id
      GROUP BY p.id, p.name, p.name_norm, p.image_url
      ORDER BY (p.image_url IS NOT NULL) DESC, fame DESC
      LIMIT 300`,
    [teamAId, teamBId],
  );
  const validNameMatches = allBothRows
    .map((r) => ({
      id: Number(r.id),
      name: r.name,
      nameNorm: r.name_norm,
      sim: 0,
      imageUrl: r.image_url,
      fame: Number(r.fame),
      score: validAnswerNameScore(norm, r.name_norm),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || b.fame - a.fame);

  // Players matched strongly enough to be "the specific name you typed" (covers
  // same-name variants like R9 "Ronaldo" vs "Cristiano Ronaldo").
  const exactCluster = eligible.filter((c) => c.sim >= config.verifyExactThreshold);
  const exactBoth = exactCluster.filter((c) => playedBoth(c.id));
  // If the user typed a full non-answer name (e.g. "Luis Pedro Cavanda"), do not
  // rescue it through a shorter valid token ("Pedro"). Bare one-token answers are
  // still allowed to resolve against the full valid-answer set below.
  const strictFullNameMiss = nameTokens(norm).length > 1 && exactCluster.length > 0 && exactBoth.length === 0;

  // Candidates are ordered by similarity descending; the best is index 0.
  let matched = eligible[0]!;
  let correct: boolean;
  let autocorrected = false;

  if (!strictFullNameMiss && validNameMatches.length > 0) {
    const best = validNameMatches[0]!;
    matched = { id: best.id, name: best.name, nameNorm: best.nameNorm, sim: best.score >= 78 ? 1 : best.sim, imageUrl: best.imageUrl };
    correct = true;
    autocorrected = best.score < 78;
  } else if (exactCluster.length > 0) {
    // You clearly named a specific player → judge them strictly. If any of the
    // same-name players played both, that's who you meant. ("Ronaldinho" has no
    // such variant, so it stays wrong — never auto-corrected to "Ronaldo".)
    // Same-name ties break by fame: "ronaldo" means Cristiano/R9, never a
    // lower-division namesake.
    matched = exactBoth.length > 0 ? mostFamous(exactBoth) : mostFamous(exactCluster);
    correct = exactBoth.length > 0;
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
      (c) => playedBoth(c.id)
        && ((c.sim >= AUTOCORRECT_MIN && notAStub(norm, c.nameNorm))
          || editAccepts(norm, c.nameNorm)
          || vowelDropAccepts(norm, c.nameNorm)),
    );
    if (bothAccepted.length > 0) {
      matched = mostFamous(bothAccepted);
      correct = true;
      autocorrected = true;
    } else {
      // The candidate SQL's trigram gate can miss a heavy-but-genuine typo of a
      // VALID answer entirely ("srgjn" shares almost no trigrams with
      // "sergen"). The valid-answer set of this round is tiny, so check every
      // both-team player directly through the SAME strict gates — garbage and
      // stubs still die in editAccepts/vowelDropAccepts.
      const rescue = allBothRows
        .map((r) => ({ id: Number(r.id), name: r.name, nameNorm: r.name_norm, sim: 0, imageUrl: r.image_url }))
        .filter((r) => editAccepts(norm, r.nameNorm) || vowelDropAccepts(norm, r.nameNorm));
      if (rescue.length > 0) {
        matched = rescue[0]!; // rows arrive fame-ordered (photo, career size)
        correct = true;
        autocorrected = true;
      } else {
        correct = false;
      }
    }
  }

  // A wrong guess surfaces "you meant X" — make X the player the human plausibly
  // meant: among the candidates whose similarity is within a whisker of the top,
  // show the most FAMOUS one, not whoever wins the trigram coin-flip. Typing
  // "pijanic" should present Miralem Pjanić, never an obscure near-anagram.
  if (!correct) {
    const SIM_BAND = 0.13;
    const nearTop = eligible.filter((c) => c.sim >= eligible[0]!.sim - SIM_BAND);
    // Context beats raw fame: a near-top candidate tied to THIS round's clubs is
    // far more plausibly who the human meant — "sergen" in a TS–BJK round is
    // Sergen Yalçın, never a lower-league namesake with a bigger current club.
    const inMatch = nearTop.filter((c) => {
      const m = memberBy.get(c.id);
      return Boolean(m?.inA || m?.inB);
    });
    matched = mostFamous(inMatch.length > 0 ? inMatch : nearTop);
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

export async function plausibleWrongClubsPlayerPlayer(playerAId: number, playerBId: number, limit = 12): Promise<string[]> {
  const { rows } = await pool.query<{ name: string }>(
    `WITH side_clubs AS (
       SELECT DISTINCT c.id, c.name, c.logo_url, COALESCE(c.popularity, 0) AS popularity
         FROM clubs c
         JOIN player_clubs pc ON pc.club_id = c.id
        WHERE c.is_national = false
          AND pc.player_id IN ($1, $2)
          AND NOT (
            EXISTS (SELECT 1 FROM player_clubs a WHERE a.player_id = $1 AND a.club_id = c.id)
            AND EXISTS (SELECT 1 FROM player_clubs b WHERE b.player_id = $2 AND b.club_id = c.id)
          )
     )
     SELECT name FROM side_clubs
      ORDER BY (logo_url IS NOT NULL) DESC, popularity DESC, random()
      LIMIT $3`,
    [playerAId, playerBId, limit],
  );
  return rows.map((r) => r.name);
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
            GREATEST(word_similarity($1, c.name_norm), ${CLUB_ALIAS_WORD_SIM}) AS sim
     FROM clubs c
     WHERE c.is_national = false
       AND GREATEST(word_similarity($1, c.name_norm), ${CLUB_ALIAS_WORD_SIM}) >= ${config.verifyMatchThreshold}
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
