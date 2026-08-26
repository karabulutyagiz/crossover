import { createHash } from 'node:crypto';
import { ARENAS, getArena, type Arena } from '../game/rank.ts';
import type { Difficulty, GameMode } from '../protocol.ts';
import { runBotDifficultyDirector, type BotDifficultyDirectorOutput } from './botDifficultyDirector.ts';
import { opponentConfig } from './opponentConfig.ts';
import { SeededRandom, clamp, intBetween, mathRandom, normal, pick, weightedPick, type RandomSource } from './random.ts';
import type { SkillRecentMatch } from './skillRating.ts';

export type BotArchetype = 'FAST_RISKY' | 'BALANCED' | 'CAREFUL' | 'CASUAL' | 'STRONG' | 'SPECIALIST';
export type ReactionSpeedProfile = 'fast' | 'balanced' | 'slow' | 'swingy';
export type KnowledgeDomain = 'europe_elite' | 'turkey' | 'national_teams' | 'journeymen' | 'obscure_leagues' | 'player_history';

export interface BotProfile {
  id: string;
  displayName: string;
  avatarId: string;
  trophyRating: number;
  /** 0..1 gameplay ability used by the bot cognition layer. */
  skillRating: number;
  /** Hidden rating-scale skill used for expected-score trophies/matchmaking. */
  skillMean: number;
  skillUncertainty: number;
  difficultyDirector?: BotDifficultyDirectorOutput;
  knowledgeDepth: number;
  recallConsistency: number;
  inputSpeed: number;
  pressureHandling: number;
  answerConfidence: number;
  questionDepthTolerance: number;
  footballKnowledge: number;
  reactionSpeed: number;
  confidence: number;
  consistency: number;
  riskTolerance: number;
  easyAccuracy: number;
  mediumAccuracy: number;
  hardAccuracy: number;
  responseMedianMs: number;
  responseVarianceMs: number;
  reactionSpeedProfile: ReactionSpeedProfile;
  answerAccuracy: number;
  aggression: number;
  hesitationProbability: number;
  mistakeProbability: number;
  timeoutProbability: number;
  participationRate: number;
  preferredDecisionDelay: [number, number];
  favoriteKnowledgeDomains: KnowledgeDomain[];
  weakKnowledgeDomains: KnowledgeDomain[];
  emoteFrequency: number;
  rematchAcceptance: number;
  seed: string;
  arena: Arena;
  behaviorArchetype: BotArchetype;
  difficulty: Difficulty;
  level: number;
  frame: string | null;
}

export interface BotPressureProfile {
  pressure: number;
  relief?: number;
  botWins: number;
  botGames: number;
  recentWins: number;
  recentGames: number;
  winStreak?: number;
  trophyGain30m?: number;
  botWins30m?: number;
}

export interface AdaptiveBotProfileInput {
  userKey: string;
  playerTrophies: number;
  playerSkillMean: number;
  playerSkillUncertainty: number;
  playerMatchesPlayed: number;
  recentCooldown: number;
  forcedArchetype?: string;
  forcedSkill?: number;
  pressureProfile?: BotPressureProfile;
  velocityPressure?: number;
  gameMode?: GameMode;
  queueHealthScore?: number | null;
  accuracyEma?: number;
  responseTimeEmaMs?: number | null;
  easyQuestionAccuracy?: number;
  mediumQuestionAccuracy?: number;
  hardQuestionAccuracy?: number;
  currentForm?: number;
  recentMatches?: SkillRecentMatch[];
  recentBotExposure?: number;
  seed?: string;
  blockedBotIds?: ReadonlySet<string>;
  blockedBotDisplayNames?: ReadonlySet<string>;
}

interface BotIdentity {
  id: string;
  name: string;
}

const THEMED_HANDLES = [
  'DerbiKral', 'SahaUstasi', 'GolHafiza', 'FutbolDefteri', 'TopCambazi', 'PasUstasi',
  'ScoutKafa', 'TribunKusu', 'KupaAvcisi', 'RondoSever', 'KaleciRuhu', 'TaktikUsta',
  'OrtaSaha', 'KanatHizi', 'FormaArsivi', 'RetroGolcu', 'LigGezgini', 'Kramponcu',
  'GolDefteri', 'Transferci', 'CizgiAdam', 'PresGucu', 'KornerUstasi', 'SantraKafa',
  'FutbolArsivi', 'AvrupaGecesi', 'LigHafizasi', 'SahaKartali', 'OnNumara', 'ForvetAkli',
  'PasHaritasi', 'KupaYolu', 'GolYolu', 'MacGunu', 'TakimRuhu', 'KilitPas',
  'DerbiAdam', 'SahaAdam', 'GolcuKafa', 'ScoutAbi', 'RondoAbi', 'KanatAdam',
];

const HUMAN_HANDLES = [
  'Emir', 'Kaan', 'Arda', 'Mert', 'Kerem', 'Berke', 'Efe', 'Deniz',
  'Atlas', 'Batu', 'Ozan', 'Tuna', 'Doruk', 'Can', 'Alp', 'Yigit',
  'Baran', 'Eren', 'Burak', 'Umut', 'Onur', 'Tolga', 'Bora', 'Mete',
  'Kuzey', 'Furkan', 'Sarp', 'Salih', 'Yusuf', 'Enes', 'Ali', 'Veli',
  'Ahmet', 'Mehmet', 'Mustafa', 'Hasan', 'Huseyin', 'Ibrahim', 'Murat', 'Selim',
  'Emre', 'Berat', 'Oguzhan', 'Samet', 'Talha', 'Hamza', 'Omer', 'Alperen',
  'Batuhan', 'Taha', 'Baris', 'Mehmetali', 'Kadir', 'Berkay', 'Emirhan', 'Semih',
  'Alican', 'Serkan', 'Cem', 'Cenk', 'Sinan', 'Volkan', 'Yasin', 'Tarik',
  'Hakan', 'Gokhan', 'Koray', 'Anil', 'Berk', 'Kubilay', 'Cihan', 'Eray',
  'Tolgahan', 'Alparslan', 'Ege', 'Toprak', 'Ruzgar', 'Poyraz', 'Aras',
];

const GUEST_STYLE_HANDLE_WEIGHT = 0;
const HUMAN_HANDLE_WEIGHT = 0.86;

const AVATARS = Array.from({ length: 34 }, (_, i) => `pp${i + 1}`);
const DOMAINS: KnowledgeDomain[] = ['europe_elite', 'turkey', 'national_teams', 'journeymen', 'obscure_leagues', 'player_history'];
const recentByUser = new Map<string, string[]>();

function hashUnit(seed: string): number {
  const h = createHash('sha256').update(seed).digest();
  return h.readUInt32BE(0) / 0xffffffff;
}

function rngFor(seed?: string): RandomSource {
  return seed ? new SeededRandom(seed) : mathRandom;
}

function guestStyleHandle(rng: RandomSource): string {
  let digits = String(1 + Math.floor(rng.next() * 9));
  for (let i = 0; i < 8; i++) digits += Math.floor(rng.next() * 10);
  return `M${digits}`;
}

function identityForName(name: string): BotIdentity {
  return { id: `bot_${hashUnit(name).toString().slice(2, 10)}`, name };
}

function displayNameKey(name: string): string {
  return name.trim().toLowerCase();
}

function identityBlocked(identity: BotIdentity, input: Pick<AdaptiveBotProfileInput, 'blockedBotIds' | 'blockedBotDisplayNames'>): boolean {
  return Boolean(input.blockedBotIds?.has(identity.id) || input.blockedBotDisplayNames?.has(displayNameKey(identity.name)));
}

function rememberIdentity(userKey: string, recentCooldown: number, recent: string[], identity: BotIdentity): BotIdentity {
  const nextRecent = [identity.id, ...recent.filter((id) => id !== identity.id)].slice(0, Math.max(1, recentCooldown));
  recentByUser.set(userKey, nextRecent);
  return identity;
}

function availableGuestStyleIdentity(
  rng: RandomSource,
  recent: string[],
  input: Pick<AdaptiveBotProfileInput, 'blockedBotIds' | 'blockedBotDisplayNames'>,
  attempts: number,
): BotIdentity | null {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const candidate = identityForName(guestStyleHandle(rng));
    if (!recent.includes(candidate.id) && !identityBlocked(candidate, input)) return candidate;
  }
  return null;
}

function weightedTrophyOffset(playerTrophies: number, pressure: number, rng: RandomSource): number {
  const tension = clamp(pressure, -0.35, 1);
  const base = Math.max(40, Math.round(playerTrophies * 0.10));
  const roll = rng.next();
  const direction = rng.next() < 0.52 + tension * 0.24 ? 1 : -1;
  if (roll < 0.72) return direction * Math.round(base * (0.15 + rng.next() * (0.78 + Math.max(0, tension) * 0.42)));
  if (roll < 0.88) return Math.round(base * (0.95 + rng.next() * (0.50 + Math.max(0, tension) * 0.54)));
  return -Math.round(base * (0.90 + rng.next() * 0.60));
}

export function botTrophiesForPlayer(playerTrophies: number, pressure = 0, rng: RandomSource = mathRandom): number {
  const raw = Math.max(0, playerTrophies + weightedTrophyOffset(playerTrophies, pressure, rng) + Math.round((rng.next() - 0.5) * 31));
  const antiFarmFloor = pressure >= 0.75
    ? playerTrophies + 60 + Math.round(rng.next() * 160)
    : pressure >= 0.45
      ? playerTrophies + 20 + Math.round(rng.next() * 95)
      : 0;
  const pressured = Math.max(raw, antiFarmFloor);
  const adjusted = pressured % 10 === 0 ? pressured + (rng.next() < 0.5 ? 3 : -7) : pressured;
  return Math.max(0, adjusted);
}

function sameArenaTrophiesForPlayer(playerTrophies: number, botTrophies: number): number {
  const playerArena = getArena(playerTrophies);
  const arenaIndex = ARENAS.findIndex((arena) => arena.minTrophies === playerArena.minTrophies && arena.name === playerArena.name);
  const nextArena = arenaIndex >= 0 ? ARENAS[arenaIndex + 1] : undefined;
  const min = playerArena.minTrophies;
  const max = nextArena ? nextArena.minTrophies - 1 : Number.MAX_SAFE_INTEGER;
  return Math.round(clamp(botTrophies, min, max));
}

export function skillMeanFromTrophies(playerTrophies: number): number {
  return Math.round(1000 + clamp(Math.sqrt(Math.max(0, playerTrophies)) * 5.2, 0, 430));
}

export function botSkillFractionFromMean(skillMean: number): number {
  return clamp((skillMean - 760) / 920, 0.12, 0.98);
}

export function botSkillMeanFromFraction(skill: number): number {
  return Math.round(760 + clamp(skill, 0.1, 0.98) * 920);
}

function archetypeForSkill(skill: number, pressure: number, rng: RandomSource): BotArchetype {
  const high = skill >= 0.72;
  const mid = skill >= 0.44;
  const weights = high
    ? [
        { value: 'BALANCED' as const, weight: 0.24 },
        { value: 'CAREFUL' as const, weight: 0.24 },
        { value: 'FAST_RISKY' as const, weight: 0.22 + pressure * 0.12 },
        { value: 'STRONG' as const, weight: 0.18 + pressure * 0.10 },
        { value: 'SPECIALIST' as const, weight: 0.12 },
      ]
    : mid
      ? [
          { value: 'CASUAL' as const, weight: 0.18 },
          { value: 'BALANCED' as const, weight: 0.34 },
          { value: 'CAREFUL' as const, weight: 0.18 },
          { value: 'FAST_RISKY' as const, weight: 0.18 + pressure * 0.10 },
          { value: 'SPECIALIST' as const, weight: 0.10 },
          { value: 'STRONG' as const, weight: 0.02 + pressure * 0.08 },
        ]
      : [
          { value: 'CASUAL' as const, weight: 0.50 },
          { value: 'BALANCED' as const, weight: 0.30 },
          { value: 'FAST_RISKY' as const, weight: 0.13 },
          { value: 'CAREFUL' as const, weight: 0.07 },
        ];
  return weightedPick(rng, weights) ?? 'BALANCED';
}

function difficultyFromSkill(skill: number): Difficulty {
  if (skill < 0.42) return 'easy';
  if (skill < 0.72) return 'medium';
  return 'hard';
}

function frameForArena(arena: Arena): string | null {
  const idx = ARENAS.findIndex((a) => a.name === arena.name);
  if (idx >= 6) return 'goat';
  if (idx >= 5) return 'diamond';
  if (idx >= 4) return 'gold';
  if (idx >= 3) return 'silver';
  if (idx >= 2) return 'bronze';
  return null;
}

function levelForTrophies(trophies: number, skill: number, rng: RandomSource): number {
  return Math.round(clamp(2 + trophies / 180 + skill * 12 + rng.next() * 4, 1, 50));
}

function profileDomains(archetype: BotArchetype, rng: RandomSource): { favorite: KnowledgeDomain[]; weak: KnowledgeDomain[] } {
  const favorite = new Set<KnowledgeDomain>();
  const weak = new Set<KnowledgeDomain>();
  if (archetype === 'CASUAL') favorite.add('europe_elite');
  if (archetype === 'SPECIALIST') favorite.add(pick(rng, ['turkey', 'obscure_leagues', 'national_teams'] as const) ?? 'turkey');
  if (archetype === 'STRONG') { favorite.add('player_history'); favorite.add('journeymen'); }
  while (favorite.size < 2) favorite.add(pick(rng, DOMAINS) ?? 'europe_elite');
  for (const d of DOMAINS) {
    if (!favorite.has(d) && rng.next() < (archetype === 'CASUAL' ? 0.34 : 0.22)) weak.add(d);
  }
  if (!weak.size) weak.add(pick(rng, DOMAINS.filter((d) => !favorite.has(d))) ?? 'obscure_leagues');
  return { favorite: [...favorite], weak: [...weak].slice(0, 2) };
}

function chooseIdentity(userKey: string, recentCooldown: number, rng: RandomSource, input: Pick<AdaptiveBotProfileInput, 'blockedBotIds' | 'blockedBotDisplayNames'>): BotIdentity {
  const recent = recentByUser.get(userKey) ?? [];
  if (rng.next() < GUEST_STYLE_HANDLE_WEIGHT) {
    const guestIdentity = availableGuestStyleIdentity(rng, recent, input, 4);
    if (guestIdentity) return rememberIdentity(userKey, recentCooldown, recent, guestIdentity);
  }
  const preferred = rng.next() < HUMAN_HANDLE_WEIGHT ? HUMAN_HANDLES : THEMED_HANDLES;
  const fallback = preferred === HUMAN_HANDLES ? THEMED_HANDLES : HUMAN_HANDLES;
  const candidates = [...preferred, ...fallback]
    .map(identityForName)
    .filter((candidate) => !identityBlocked(candidate, input));
  if (!candidates.length) {
    const guestIdentity = availableGuestStyleIdentity(rng, recent, input, 64);
    if (guestIdentity) return rememberIdentity(userKey, recentCooldown, recent, guestIdentity);
    throw new Error('bot identity pool exhausted');
  }
  const filtered = candidates.filter((c) => !recent.includes(c.id));
  const pickable = filtered.length ? filtered : candidates;
  const pickIdx = Math.floor(rng.next() * pickable.length);
  const selected = pickable[pickIdx] ?? pickable[0]!;
  return rememberIdentity(userKey, recentCooldown, recent, selected);
}

export function selectBotProfileForSkill(input: AdaptiveBotProfileInput): BotProfile {
  const cfg = opponentConfig();
  const seed = input.seed ?? `${input.userKey}:${Date.now()}:${Math.random()}`;
  const rng = rngFor(seed);
  const identity = chooseIdentity(input.userKey, input.recentCooldown, rng, input);
  const director = runBotDifficultyDirector({
    playerId: input.userKey,
    playerHiddenMmr: input.playerSkillMean,
    playerSkillUncertainty: input.playerSkillUncertainty,
    playerTrophies: input.playerTrophies,
    matchesPlayed: input.playerMatchesPlayed,
    recentMatches: input.recentMatches,
    accuracyEma: input.accuracyEma,
    responseTimeEmaMs: input.responseTimeEmaMs,
    easyQuestionAccuracy: input.easyQuestionAccuracy,
    mediumQuestionAccuracy: input.mediumQuestionAccuracy,
    hardQuestionAccuracy: input.hardQuestionAccuracy,
    currentForm: input.currentForm,
    pressureProfile: input.pressureProfile,
    velocityPressure: input.velocityPressure,
    questionMode: input.gameMode,
    queueHealthScore: input.queueHealthScore,
    recentBotExposure: input.recentBotExposure,
    rng,
  });
  const pressure = clamp(
    (input.pressureProfile?.pressure ?? 0)
      - (input.pressureProfile?.relief ?? 0) * 0.35
      + (input.velocityPressure ?? 0),
    -0.28,
    0.86,
  );
  const uncertainty = clamp(input.playerSkillUncertainty, cfg.skillUncertaintyMin, cfg.skillUncertaintyMax);
  const onboardingBias = input.playerMatchesPlayed < 8
    ? cfg.newPlayerDifficultyBias * 260 * (1 - input.playerMatchesPlayed / 8) * clamp(uncertainty / cfg.skillUncertaintyMax, 0.35, 1)
    : 0;
  const targetSpread = clamp(cfg.targetSkillDifference * 0.55 + uncertainty * 0.14, 30, 135);
  const legacyTargetMean = input.playerSkillMean - onboardingBias + pressure * 115 + normal(rng, 0, targetSpread);
  const targetMean = director.enabled ? director.targetSkillMean : legacyTargetMean;
  const forcedMean = typeof input.forcedSkill === 'number' && Number.isFinite(input.forcedSkill)
    ? botSkillMeanFromFraction(input.forcedSkill)
    : null;
  // ELIT BANT (2026-08-26): bot skillMean tavani sabit 2100'du ve beceri egrisi
  // ~1660'ta doyuyordu — 2400 MMR'li bir oyuncu ust bant botlara %83 kazanip
  // 76 maclik seri yapabildi (M240946288 vakasi). Oyuncu 2000+ ortalamadaysa
  // botlar oyuncuyu TAKIP eder (tavan 2800'e esner) ve asagida orta/zor soru
  // isabeti + tempo elitlesir; 2600'de tam guc.
  const elite = clamp((input.playerSkillMean - 2000) / 600, 0, 1);
  const skillMean = Math.round(clamp(forcedMean ?? targetMean, 560, 2100 + elite * 700));
  const baseSkill = botSkillFractionFromMean(skillMean);
  const forcedArchetype = ['FAST_RISKY', 'BALANCED', 'CAREFUL', 'CASUAL', 'STRONG', 'SPECIALIST'].includes(input.forcedArchetype ?? '')
    ? input.forcedArchetype as BotArchetype
    : undefined;
  const archetype = forcedArchetype ?? archetypeForSkill(baseSkill, pressure, rng);
  const archetypeKnowledgeBias: Record<BotArchetype, number> = {
    FAST_RISKY: -0.02,
    BALANCED: 0,
    CAREFUL: 0.05,
    CASUAL: -0.12,
    STRONG: 0.12,
    SPECIALIST: 0.03,
  };
  const reactionBias: Record<BotArchetype, number> = {
    FAST_RISKY: 0.13,
    BALANCED: 0,
    CAREFUL: -0.08,
    CASUAL: -0.04,
    STRONG: 0.09,
    SPECIALIST: 0,
  };
  const riskBias: Record<BotArchetype, number> = {
    FAST_RISKY: 0.28,
    BALANCED: 0,
    CAREFUL: -0.22,
    CASUAL: 0.10,
    STRONG: 0.12,
    SPECIALIST: 0.02,
  };
  const knowledgeDepth = director.enabled ? director.knowledgeDepth : baseSkill;
  const recallConsistency = director.enabled ? director.recallConsistency : clamp(0.42 + baseSkill * 0.42, 0.15, 0.96);
  const inputSpeed = director.enabled ? director.inputSpeed : baseSkill;
  const pressureHandling = director.enabled ? director.pressureHandling : clamp(0.30 + baseSkill * 0.50, 0.12, 0.96);
  const answerConfidence = director.enabled ? director.answerConfidence : clamp(0.35 + baseSkill * 0.48, 0.12, 0.94);
  const questionDepthTolerance = director.enabled ? director.questionDepthTolerance : knowledgeDepth;
  const footballKnowledge = clamp(knowledgeDepth + archetypeKnowledgeBias[archetype] * 0.72 + normal(rng, 0, 0.030), 0.12, 0.98);
  const reactionSpeed = clamp(inputSpeed + reactionBias[archetype] * 0.75 + normal(rng, 0, 0.035), 0.08, 0.98);
  const confidence = clamp(answerConfidence + riskBias[archetype] * 0.18 + normal(rng, 0, 0.045), 0.12, 0.94);
  const consistency = clamp(recallConsistency + (archetype === 'CAREFUL' ? 0.10 : archetype === 'FAST_RISKY' ? -0.10 : 0) + normal(rng, 0, 0.035), 0.15, 0.96);
  const riskTolerance = clamp(0.42 + riskBias[archetype] + confidence * 0.18 + normal(rng, 0, 0.035), 0.08, 0.96);
  const easyAccuracy = clamp(0.54 + footballKnowledge * 0.38 + consistency * 0.05 + elite * 0.04, 0.48, 0.99);
  const mediumAccuracy = clamp(0.22 + questionDepthTolerance * 0.50 + footballKnowledge * 0.16 + consistency * 0.05 + elite * 0.34, 0.14, 0.96);
  const hardAccuracy = clamp(0.05 + questionDepthTolerance * 0.58 + (archetype === 'SPECIALIST' ? 0.03 : 0) + elite * 0.38, 0.035, 0.91);
  const answerAccuracy = clamp(easyAccuracy * 0.34 + mediumAccuracy * 0.42 + hardAccuracy * 0.24, 0.12, 0.95);
  const reactionSpeedProfile: ReactionSpeedProfile = archetype === 'FAST_RISKY' || archetype === 'STRONG'
    ? 'fast'
    : archetype === 'CAREFUL'
      ? 'slow'
      : archetype === 'CASUAL'
        ? 'swingy'
        : 'balanced';
  const medianBase = 7600 - reactionSpeed * 4100 - elite * 1400 + (director.enabled ? director.newPlayerProtection * 950 : 0) + (archetype === 'CAREFUL' ? 850 : archetype === 'FAST_RISKY' ? -500 : 0);
  const responseMedianMs = Math.round(clamp(medianBase + normal(rng, 0, 420), cfg.botReactionMinMs + 250, cfg.botReactionMaxMs - 1400));
  const responseVarianceMs = Math.round(clamp(900 + (1 - consistency) * 3200 + (reactionSpeedProfile === 'swingy' ? 1800 : 0), 450, 6400));
  const mistakeProbability = clamp(((1 - answerAccuracy) * (0.28 + riskTolerance * 0.42) + (1 - consistency) * 0.06) * (1 - elite * 0.45), cfg.botErrorMin, cfg.botErrorMax);
  const timeoutProbability = clamp(((1 - footballKnowledge) * 0.10 + (1 - confidence) * 0.05 + (archetype === 'CAREFUL' ? 0.025 : 0)) * (1 - elite * 0.6), cfg.botTimeoutMin, cfg.botTimeoutMax);
  const hesitationProbability = clamp(((1 - confidence) * 0.34 + (archetype === 'CAREFUL' ? 0.18 : archetype === 'FAST_RISKY' ? -0.08 : 0)) * (1 - elite * 0.4), 0.04, 0.62);
  const participationRate = clamp(0.74 + confidence * 0.14 + pressureHandling * 0.10 - timeoutProbability * 0.18, 0.58, 0.985);
  const preferredDecisionDelay: [number, number] = [
    Math.round(clamp(responseMedianMs - responseVarianceMs * 0.75, cfg.botReactionMinMs, cfg.botReactionMaxMs - 1000)),
    Math.round(clamp(responseMedianMs + responseVarianceMs * 1.15, cfg.botReactionMinMs + 900, cfg.botReactionMaxMs)),
  ];
  const trophyRating = sameArenaTrophiesForPlayer(input.playerTrophies, botTrophiesForPlayer(input.playerTrophies, pressure, rng));
  const arena = getArena(trophyRating);
  const avatarId = AVATARS[Math.floor(hashUnit(`${identity.id}:${trophyRating}:${seed}`) * AVATARS.length)] ?? 'pp7';
  const domains = profileDomains(archetype, rng);
  const emoteSuppression = director.enabled ? director.emoteSuppression : 0;

  return {
    id: identity.id,
    displayName: identity.name,
    avatarId,
    trophyRating,
    skillRating: baseSkill,
    skillMean,
    skillUncertainty: Math.round(clamp(95 + (1 - consistency) * 120, 70, 240)),
    difficultyDirector: director,
    knowledgeDepth,
    recallConsistency,
    inputSpeed,
    pressureHandling,
    answerConfidence,
    questionDepthTolerance,
    footballKnowledge,
    reactionSpeed,
    confidence,
    consistency,
    riskTolerance,
    easyAccuracy,
    mediumAccuracy,
    hardAccuracy,
    responseMedianMs,
    responseVarianceMs,
    reactionSpeedProfile,
    answerAccuracy,
    aggression: riskTolerance,
    hesitationProbability,
    mistakeProbability,
    timeoutProbability,
    participationRate,
    preferredDecisionDelay,
    favoriteKnowledgeDomains: domains.favorite,
    weakKnowledgeDomains: domains.weak,
    emoteFrequency: clamp(cfg.emoteProbability * (0.65 + confidence * 0.7 + riskTolerance * 0.35) * (1 - emoteSuppression), 0.015, 0.72),
    rematchAcceptance: clamp(cfg.rematchProbability * (0.72 + (archetype === 'CAREFUL' ? -0.10 : 0) + confidence * 0.34), 0.12, 0.88),
    seed,
    arena,
    behaviorArchetype: archetype,
    difficulty: difficultyFromSkill(baseSkill),
    level: levelForTrophies(trophyRating, baseSkill, rng),
    frame: frameForArena(arena),
  };
}

export function selectBotProfile(
  userKey: string,
  playerTrophies: number,
  recentCooldown: number,
  forcedArchetype?: string,
  forcedSkill?: number,
  pressureProfile?: BotPressureProfile,
): BotProfile {
  return selectBotProfileForSkill({
    userKey,
    playerTrophies,
    playerSkillMean: skillMeanFromTrophies(playerTrophies) + (pressureProfile?.pressure ?? 0) * 120,
    playerSkillUncertainty: 220,
    playerMatchesPlayed: Math.max(8, pressureProfile?.recentGames ?? 8),
    recentCooldown,
    forcedArchetype,
    forcedSkill,
    pressureProfile,
    seed: `${userKey}:${playerTrophies}:${Date.now()}:${intBetween(mathRandom, 0, 1_000_000)}`,
  });
}
