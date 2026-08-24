import { pool } from '../db/pool.ts';
import type { ClubRef } from '../protocol.ts';
import type { BotArchetype, KnowledgeDomain } from '../matchmaking/botProfiles.ts';
import { clamp, mathRandom, weightedPick, type RandomSource } from '../matchmaking/random.ts';
import {
  CLUB_CATALOG,
  audienceBiasMultiplier,
  clubPopularityTier,
  isNicheTier,
  tierBaseWeight,
  type ClubCatalogEntry,
  type ClubPopularityTier,
} from './clubPopularity.ts';

const A_TEAM_ONLY = `
  AND c.name_norm !~* '(women|femen|femin|femmin|frauen|kadin|ladies)'
  AND c.name_norm !~* '(^|[^a-z])(u-?1[2-9]|u-?2[0-3]|sub-?[0-9]|youth|jugend|primavera|juvenil|altyapi|akademi|academy|junior|jeugd)([^a-z]|$)'
  AND c.name_norm !~* '( b| ii| iii| reserves?| castilla)$'
  AND c.name_norm <> 'atletico madrileno'
  AND c.name_norm <> 'atletico mg'
`;

export const matchupSelectionConfig = {
  nicheMatchProbability: Number(process.env.NICHE_MATCH_PROBABILITY ?? '0.26'),
  candidateLimit: 180,
  recentWindow: 8,
  maxNicheRoundsPerMatch: 1,
  nicheAllowedWeightBoost: 80,
  minNormalAnswerCount: 1,
  minPreferredAnswerCount: 2,
} as const;

export interface MatchClubSelectionState {
  allowNicheRound: boolean;
  nicheRoundUsed: boolean;
  recentClubIds: number[];
}

export interface BotTeamSelectionInput {
  playerTeamId: number | null;
  excludeIds?: number[];
  state: MatchClubSelectionState;
  favoriteDomains?: readonly KnowledgeDomain[];
  archetype?: BotArchetype | string | null;
  rng?: RandomSource;
}

export interface BotTeamSelectionResult {
  club: ClubRef;
  tier: ClubPopularityTier;
  answerCount: number;
  recognizableAnswerScore: number;
  matchupScore: number;
  niche: boolean;
}

interface ClubCandidateRow {
  id: string;
  name: string;
  name_norm: string;
  logo_url: string | null;
  country: string | null;
  league: string | null;
  pop: string;
  answer_count: string;
  answer_fame: string;
}

interface ScoredCandidate {
  value: BotTeamSelectionResult;
  weight: number;
}

export function createMatchClubSelectionState(rng: RandomSource = mathRandom): MatchClubSelectionState {
  return {
    allowNicheRound: rng.next() < clamp(matchupSelectionConfig.nicheMatchProbability, 0, 1),
    nicheRoundUsed: false,
    recentClubIds: [],
  };
}

export function recordMatchupClubs(state: MatchClubSelectionState, clubs: readonly { id: number; name: string }[]): void {
  for (const club of clubs) {
    if (!state.recentClubIds.includes(club.id)) state.recentClubIds.unshift(club.id);
    if (state.recentClubIds.length > matchupSelectionConfig.recentWindow) state.recentClubIds.pop();
    if (isNicheTier(clubPopularityTier({ name: club.name }))) state.nicheRoundUsed = true;
  }
}

export function canUseNiche(state: MatchClubSelectionState): boolean {
  return state.allowNicheRound && !state.nicheRoundUsed;
}

export async function selectBotTeamForMatchup(input: BotTeamSelectionInput): Promise<BotTeamSelectionResult | null> {
  const rng = input.rng ?? mathRandom;
  const rows = input.playerTeamId != null
    ? await rowsForHumanTeam(input.playerTeamId, input.excludeIds ?? [])
    : await rowsForOpenPick(input.excludeIds ?? []);
  const scored = scoreRows(rows, input, rng);
  return weightedPick(rng, scored) ?? null;
}

export function selectCatalogTeamForSimulation(input: BotTeamSelectionInput & { catalog?: readonly ClubCatalogEntry[] }): BotTeamSelectionResult | null {
  const rng = input.rng ?? mathRandom;
  const excludedNames = new Set((input.excludeIds ?? []).map(String));
  const catalog = input.catalog ?? CLUB_CATALOG;
  const scored: ScoredCandidate[] = [];
  for (let i = 0; i < catalog.length; i++) {
    const item = catalog[i];
    if (!item || excludedNames.has(String(i + 1))) continue;
    const tier = item.tier;
    const niche = isNicheTier(tier);
    if (niche && !canUseNiche(input.state)) continue;
    const answerCount = syntheticAnswerCount(tier, rng);
    const answerFame = syntheticAnswerFame(tier);
    const score = matchupScore({
      name: item.name,
      tier,
      popularity: answerFame,
      answerCount,
      answerFame,
      recentPenalty: recentPenalty(input.state.recentClubIds, i + 1),
      favoriteDomains: input.favoriteDomains,
      archetype: input.archetype,
    }) * (niche && canUseNiche(input.state) ? matchupSelectionConfig.nicheAllowedWeightBoost : 1);
    scored.push({
      value: {
        club: { id: i + 1, name: item.name, logoUrl: null },
        tier,
        answerCount,
        recognizableAnswerScore: popularityScore(answerFame),
        matchupScore: score,
        niche,
      },
      weight: score,
    });
  }
  return weightedPick(rng, scored) ?? null;
}

async function rowsForHumanTeam(playerTeamId: number, excludeIds: number[]): Promise<ClubCandidateRow[]> {
  const exclude = excludeIds.length ? excludeIds : [-1];
  const { rows } = await pool.query<ClubCandidateRow>(
    `WITH answers AS (
       SELECT pc2.club_id AS cid,
              count(DISTINCT pc1.player_id) AS answer_count,
              COALESCE(MAX(GREATEST(COALESCE(cf.popularity, 0), (SELECT count(*) FROM player_clubs x WHERE x.club_id = allpc.club_id))), 0) AS answer_fame
         FROM player_clubs pc1
         JOIN player_clubs pc2 ON pc2.player_id = pc1.player_id AND pc2.club_id <> $1
         JOIN player_clubs allpc ON allpc.player_id = pc1.player_id
         JOIN clubs cf ON cf.id = allpc.club_id
        WHERE pc1.club_id = $1
        GROUP BY pc2.club_id
     )
     SELECT c.id, c.name, c.name_norm, c.logo_url, c.country, c.league,
            COALESCE(NULLIF(c.popularity, 0), (SELECT count(*) FROM player_clubs pc WHERE pc.club_id = c.id)) AS pop,
            answers.answer_count, answers.answer_fame
       FROM answers
       JOIN clubs c ON c.id = answers.cid
      WHERE c.is_national = false
        AND c.logo_url IS NOT NULL
        AND c.id <> ALL($2::bigint[])
        ${A_TEAM_ONLY}
      ORDER BY answers.answer_count DESC, answers.answer_fame DESC, pop DESC
      LIMIT $3`,
    [playerTeamId, exclude, matchupSelectionConfig.candidateLimit],
  );
  return rows;
}

async function rowsForOpenPick(excludeIds: number[]): Promise<ClubCandidateRow[]> {
  const exclude = excludeIds.length ? excludeIds : [-1];
  const { rows } = await pool.query<ClubCandidateRow>(
    `SELECT c.id, c.name, c.name_norm, c.logo_url, c.country, c.league,
            COALESCE(NULLIF(c.popularity, 0), (SELECT count(*) FROM player_clubs pc WHERE pc.club_id = c.id)) AS pop,
            4::bigint AS answer_count,
            COALESCE(NULLIF(c.popularity, 0), (SELECT count(*) FROM player_clubs pc WHERE pc.club_id = c.id)) AS answer_fame
       FROM clubs c
      WHERE c.is_national = false
        AND c.logo_url IS NOT NULL
        AND EXISTS (SELECT 1 FROM player_clubs pc WHERE pc.club_id = c.id)
        AND c.id <> ALL($1::bigint[])
        ${A_TEAM_ONLY}
      ORDER BY pop DESC
      LIMIT $2`,
    [exclude, matchupSelectionConfig.candidateLimit],
  );
  return rows;
}

function scoreRows(rows: ClubCandidateRow[], input: BotTeamSelectionInput, rng: RandomSource): ScoredCandidate[] {
  const out: ScoredCandidate[] = [];
  for (const row of rows) {
    const answerCount = Number(row.answer_count) || 0;
    if (input.playerTeamId != null && answerCount < matchupSelectionConfig.minNormalAnswerCount) continue;
    const popularity = Number(row.pop) || 0;
    const answerFame = Number(row.answer_fame) || popularity;
    const tier = clubPopularityTier({ name: row.name, nameNorm: row.name_norm, popularity, league: row.league, country: row.country });
    const niche = isNicheTier(tier);
    if (niche && !canUseNiche(input.state)) continue;
    const score = matchupScore({
      name: row.name,
      tier,
      popularity,
      answerCount,
      answerFame,
      recentPenalty: recentPenalty(input.state.recentClubIds, Number(row.id)),
      favoriteDomains: input.favoriteDomains,
      archetype: input.archetype,
    }) * (niche && canUseNiche(input.state) ? matchupSelectionConfig.nicheAllowedWeightBoost : 1) * (0.92 + rng.next() * 0.18);
    if (score <= 0) continue;
    out.push({
      value: {
        club: { id: Number(row.id), name: displayClubName(Number(row.id), row.name), logoUrl: row.logo_url },
        tier,
        answerCount,
        recognizableAnswerScore: popularityScore(answerFame),
        matchupScore: Number(score.toFixed(4)),
        niche,
      },
      weight: score,
    });
  }
  return out;
}

function matchupScore(args: { name: string; tier: ClubPopularityTier; popularity: number; answerCount: number; answerFame: number; recentPenalty: number; favoriteDomains?: readonly KnowledgeDomain[]; archetype?: BotArchetype | string | null }): number {
  const answerDepth = clamp(Math.log1p(args.answerCount) / Math.log(9), 0, 1);
  const answerRecognition = popularityScore(args.answerFame);
  const clubRecognition = tierBaseWeight(args.tier);
  const depthGate = args.answerCount >= matchupSelectionConfig.minPreferredAnswerCount ? 1 : 0.62;
  const obscurityPenalty = args.tier === 'NICHE' && answerRecognition < 0.28 ? 0.34 : 1;
  return clubRecognition
    * (0.58 + answerDepth * 0.72)
    * (0.72 + answerRecognition * 0.74)
    * depthGate
    * obscurityPenalty
    * args.recentPenalty
    * audienceBiasMultiplier(args.name, args.favoriteDomains, args.archetype);
}

function recentPenalty(recentClubIds: readonly number[], clubId: number): number {
  const idx = recentClubIds.indexOf(clubId);
  if (idx < 0) return 1;
  if (idx === 0) return 0.02;
  if (idx <= 2) return 0.16;
  if (idx <= 5) return 0.38;
  return 0.66;
}

function popularityScore(fame: number): number {
  return clamp(Math.log10(Math.max(1, fame)) / 9.5, 0, 1);
}

function syntheticAnswerCount(tier: ClubPopularityTier, rng: RandomSource): number {
  if (tier === 'GLOBAL_GIANT') return 4 + Math.floor(rng.next() * 7);
  if (tier === 'VERY_POPULAR') return 3 + Math.floor(rng.next() * 5);
  if (tier === 'POPULAR') return 2 + Math.floor(rng.next() * 4);
  if (tier === 'RECOGNIZABLE') return 1 + Math.floor(rng.next() * 3);
  return 1 + Math.floor(rng.next() * 2);
}

function syntheticAnswerFame(tier: ClubPopularityTier): number {
  if (tier === 'GLOBAL_GIANT') return 420_000_000;
  if (tier === 'VERY_POPULAR') return 130_000_000;
  if (tier === 'POPULAR') return 32_000_000;
  if (tier === 'RECOGNIZABLE') return 7_000_000;
  return 700_000;
}

function displayClubName(id: number, name: string): string {
  return id === 13 ? 'Atletico Madrid' : name;
}
