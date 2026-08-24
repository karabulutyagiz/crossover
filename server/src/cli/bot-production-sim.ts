import { decideBotAnswer, type BotDecision } from '../matchmaking/botDecision.ts';
import { selectBotProfileForSkill, type BotProfile } from '../matchmaking/botProfiles.ts';
import { SeededRandom } from '../matchmaking/random.ts';
import { CLUB_CATALOG, isGlobalGiantName, isTurkishGiantName, type ClubPopularityTier } from '../game/clubPopularity.ts';
import { createMatchClubSelectionState, recordMatchupClubs, selectCatalogTeamForSimulation } from '../game/matchupSelection.ts';

const MATCHES = 10_000;
const ROUNDS_PER_MATCH = 6;
const DECISION_SAMPLES = 12_000;

interface TimingSummary { min: number; p10: number; p25: number; median: number; p75: number; p90: number; p95: number; max: number }

function profile(seed: string, skillMean = 1100, forcedSkill?: number): BotProfile {
  return selectBotProfileForSkill({
    userKey: `sim-${seed}`,
    playerTrophies: 900,
    playerSkillMean: skillMean,
    playerSkillUncertainty: 170,
    playerMatchesPlayed: 30,
    recentCooldown: 8,
    forcedSkill,
    seed,
  });
}

function decision(p: BotProfile, seed: string, difficultyScore: number, answerPopularity: number, previousTempoMs?: number | null): BotDecision {
  return decideBotAnswer(p, {
    difficultyScore,
    answerPopularity,
    botScore: 0,
    opponentScore: 0,
    answerTextLength: 11,
    previousTempoMs,
    rng: new SeededRandom(seed),
  });
}

function independenceReport(): Record<string, number> {
  const p = profile('independence', 1100);
  let immediatePasses = 0;
  let passMismatches = 0;
  let wrongMismatches = 0;
  let typingAccelerations = 0;
  let idleActs = 0;
  let wrongA = 0;
  let wrongB = 0;
  for (let i = 0; i < 1000; i++) {
    const base = decision(p, `ind-base-${i}`, 0.48, 0.55, null);
    const afterPass = decision(p, `ind-base-${i}`, 0.48, 0.55, null);
    const afterWrong = decision(p, `ind-base-${i}`, 0.48, 0.55, null);
    const typing = decision(p, `ind-base-${i}`, 0.48, 0.55, 250);
    if (afterPass.plannedAction === 'PASS' && afterPass.plannedActionAtMs < 1400) immediatePasses += 1;
    if (afterPass.plannedAction !== base.plannedAction || afterPass.plannedActionAtMs !== base.plannedActionAtMs) passMismatches += 1;
    if (afterWrong.shouldMistake !== base.shouldMistake || afterWrong.plannedActionAtMs !== base.plannedActionAtMs) wrongMismatches += 1;
    if (typing.plannedActionAtMs < base.plannedActionAtMs) typingAccelerations += 1;
    if (base.plannedAction !== 'THINK_UNTIL_TIMEOUT') idleActs += 1;
    if (base.shouldMistake) wrongA += 1;
    if (afterWrong.shouldMistake) wrongB += 1;
  }
  return {
    samples: 1000,
    immediatePasses,
    passMismatches,
    wrongMismatches,
    typingAccelerations,
    idleActionRate: round(idleActs / 1000),
    controlWrongRate: round(wrongA / 1000),
    afterHumanWrongRate: round(wrongB / 1000),
  };
}

function teamSimulation(): Record<string, unknown> {
  const rng = new SeededRandom('team-sim-v2');
  let zeroNiche = 0;
  let oneNiche = 0;
  let gtOneNiche = 0;
  let sameConsecutive = 0;
  let recentRepeats = 0;
  let transitions = 0;
  const teamCounts = new Map<string, number>();
  const pairCounts = new Map<string, number>();
  const tierCounts = new Map<ClubPopularityTier, number>();
  for (let m = 0; m < MATCHES; m++) {
    const state = createMatchClubSelectionState(rng);
    const usedIds: number[] = [];
    const matchNames: string[] = [];
    let nicheRounds = 0;
    for (let r = 0; r < ROUNDS_PER_MATCH; r++) {
      const a = selectCatalogTeamForSimulation({ playerTeamId: null, excludeIds: usedIds, state, rng });
      if (!a) continue;
      usedIds.push(a.club.id);
      if (a.niche) state.nicheRoundUsed = true;
      const b = selectCatalogTeamForSimulation({ playerTeamId: a.club.id, excludeIds: usedIds, state, rng });
      if (!b) continue;
      usedIds.push(b.club.id);
      const roundNiche = a.niche || b.niche;
      if (roundNiche) nicheRounds += 1;
      if (roundNiche) state.nicheRoundUsed = true;
      recordMatchupClubs(state, [a.club, b.club]);
      for (const item of [a, b]) {
        teamCounts.set(item.club.name, (teamCounts.get(item.club.name) ?? 0) + 1);
        tierCounts.set(item.tier, (tierCounts.get(item.tier) ?? 0) + 1);
        const prev = matchNames[matchNames.length - 1];
        if (prev != null) {
          transitions += 1;
          if (prev === item.club.name) sameConsecutive += 1;
          if (matchNames.slice(-6).includes(item.club.name)) recentRepeats += 1;
        }
        matchNames.push(item.club.name);
      }
      const pair = [a.club.name, b.club.name].sort().join(' + ');
      pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1);
    }
    if (nicheRounds === 0) zeroNiche += 1;
    else if (nicheRounds === 1) oneNiche += 1;
    else gtOneNiche += 1;
  }
  const totalPicks = [...teamCounts.values()].reduce((s, n) => s + n, 0);
  const keyTeams = ['Galatasaray', 'Fenerbahce', 'Besiktas', 'Trabzonspor', 'Real Madrid', 'Barcelona', 'Liverpool', 'Arsenal', 'Manchester United', 'Manchester City', 'PSG', 'Inter', 'Milan', 'Juventus', 'Bayern Munich'];
  return {
    matches: MATCHES,
    zeroNichePct: pct(zeroNiche, MATCHES),
    oneNichePct: pct(oneNiche, MATCHES),
    gtOneNichePct: pct(gtOneNiche, MATCHES),
    gtOneNicheMatches: gtOneNiche,
    sameTeamConsecutiveRate: pct(sameConsecutive, transitions),
    sameTeamRecentRepeatRate: pct(recentRepeats, transitions),
    turkishGiantPickRate: pct(sumMatching(teamCounts, isTurkishGiantName), totalPicks),
    globalGiantPickRate: pct(sumMatching(teamCounts, isGlobalGiantName), totalPicks),
    tierDistribution: Object.fromEntries([...tierCounts.entries()].map(([k, v]) => [k, pct(v, totalPicks)])),
    keyTeamRates: Object.fromEntries(keyTeams.map((name) => [name, pct(teamCounts.get(name) ?? 0, totalPicks)])),
    mostCommonTeams: top(teamCounts, 16),
    mostCommonPairings: top(pairCounts, 12),
  };
}

function timingSimulation(): Record<string, unknown> {
  const times: number[] = [];
  const byDifficulty: Record<string, number[]> = { easy: [], medium: [], hard: [] };
  const byPopularity: Record<string, number[]> = { ICONIC: [], SUPERSTAR: [], POPULAR: [], DIFFICULT: [] };
  const byArchetype: Record<string, number[]> = {};
  const profiles = [profile('timing-low', 930, 0.30), profile('timing-mid', 1120, 0.56), profile('timing-high', 1360, 0.86)];
  for (let i = 0; i < DECISION_SAMPLES; i++) {
    const p = profiles[i % profiles.length]!;
    const rng = new SeededRandom(`timing-${i}`);
    const difficultyScore = [0.18, 0.42, 0.68, 0.88][i % 4]!;
    const answerPopularity = [0.92, 0.78, 0.52, 0.22][Math.floor(i / 4) % 4]!;
    const d = decideBotAnswer(p, { difficultyScore, answerPopularity, answerTextLength: 6 + Math.floor(rng.next() * 13), rng });
    if (d.plannedAction !== 'CORRECT_ANSWER' && d.plannedAction !== 'WRONG_ATTEMPT_THEN_CONTINUE') continue;
    times.push(d.plannedActionAtMs);
    byDifficulty[p.difficulty]!.push(d.plannedActionAtMs);
    const popBucket = answerPopularity >= 0.88 ? 'ICONIC' : answerPopularity >= 0.70 ? 'SUPERSTAR' : answerPopularity >= 0.42 ? 'POPULAR' : 'DIFFICULT';
    byPopularity[popBucket]!.push(d.plannedActionAtMs);
    byArchetype[p.behaviorArchetype] ??= [];
    byArchetype[p.behaviorArchetype]!.push(d.plannedActionAtMs);
  }
  return {
    samples: times.length,
    overall: summary(times),
    byDifficulty: mapSummary(byDifficulty),
    byPopularity: mapSummary(byPopularity),
    byArchetype: mapSummary(byArchetype),
  };
}

const independence = independenceReport();
const teams = teamSimulation();
const timing = timingSimulation();
const failures: string[] = [];
if (independence.immediatePasses !== 0) failures.push('human pass produced immediate bot pass spike');
if (independence.passMismatches !== 0) failures.push('pass scenario changed bot decisions');
if (independence.wrongMismatches !== 0) failures.push('wrong scenario changed bot decisions');
if (independence.typingAccelerations !== 0) failures.push('typing scenario accelerated bot');
if ((teams.gtOneNicheMatches as number) !== 0) failures.push('more than one niche round appeared in a match');
if ((teams.zeroNichePct as number) < 68 || (teams.zeroNichePct as number) > 82) failures.push(`zero niche percentage out of target: ${teams.zeroNichePct}`);
if ((teams.oneNichePct as number) < 18 || (teams.oneNichePct as number) > 32) failures.push(`one niche percentage out of target: ${teams.oneNichePct}`);
const timingOverall = (timing.overall as TimingSummary);
if (timingOverall.min < 1450) failures.push(`superhuman bot timing found: ${timingOverall.min}`);

console.log(JSON.stringify({ independence, teams, timing, failures }, null, 2));
if (failures.length) process.exit(1);

function summary(values: number[]): TimingSummary {
  const s = [...values].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))] ?? 0;
  return { min: q(0), p10: q(0.10), p25: q(0.25), median: q(0.50), p75: q(0.75), p90: q(0.90), p95: q(0.95), max: q(0.999) };
}

function mapSummary(map: Record<string, number[]>): Record<string, TimingSummary> {
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, summary(v)]));
}

function pct(n: number, d: number): number {
  return round(d > 0 ? (n / d) * 100 : 0);
}

function round(n: number): number {
  return Number(n.toFixed(3));
}

function top(map: Map<string, number>, n: number): { name: string; count: number }[] {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([name, count]) => ({ name, count }));
}

function sumMatching(map: Map<string, number>, pred: (name: string) => boolean): number {
  let total = 0;
  for (const [name, count] of map) if (pred(name)) total += count;
  return total;
}
