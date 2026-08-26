import type { Room, Transport } from './room.ts';
import type { ClientMsg, ClubRef, Difficulty, GameMode, ServerMsg, Scope } from '../protocol.ts';
import {
  randomClub, botPickFromPool, randomPlayer, botCommonPlayersRanked, getValidPlayersForCountryAndClub,
  commonPlayersLetterTeam, commonClubs, pickCountryForClub, pickClubForCountry,
  plausibleWrongPlayersTeamTeam, plausibleWrongPlayersLetterTeam,
  plausibleWrongClubsPlayerPlayer,
  type CountryTeamAnswerCandidate,
} from '../game/verify.ts';
import type { BotProfile, BotArchetype } from '../matchmaking/botProfiles.ts';
import {
  decideBotAnswer, difficultyFromScore,
  difficultyScore, pickWrongName, rngForBotRound, type BotCognitiveState, type BotDecision,
  type QuestionDifficulty,
} from '../matchmaking/botDecision.ts';
import { getQuestionDifficulty, type QuestionDifficultyEstimate } from '../matchmaking/questionDifficulty.ts';
import { clamp, mathRandom, pick, triangular, type RandomSource } from '../matchmaking/random.ts';
import { normalize } from '../game/normalize.ts';
import { log } from '../logger.ts';
import { validateCountryTeamBotCandidate } from './countryTeamBotValidation.ts';

// ─────────────────────────────────────────────────────────────────────────────
// BOT DIFFICULTY — SINGLE SOURCE OF TRUTH.
// This is the ONLY place difficulty is defined. It has regressed repeatedly because
// the knobs were scattered and someone kept softening HARD "to give the human a
// chance", which quietly collapsed HARD into MEDIUM so all tiers felt identical.
// To make that impossible:
//   • all three knobs (answer delay + know-rates) live here, and
//   • validateDifficulty() below THROWS at import (before the server serves
//     anything) if the tiers ever stop being clearly separated — a collapsed
//     config can therefore never start or reach production.
// Contract: HARD must be faster AND smarter than MEDIUM, MEDIUM than EASY.
// Verified by src/cli/difftest-invariants.ts (static) and src/cli/difftest.ts (live).
export interface DiffParams {
  /** Answer latency band [min,max] ms — how long the human has to beat the bot. */
  delayMs: [number, number];
  /** "Do I know it" probability for modes with no fame signal (country/letter/player). */
  knowBase: number;
  /** team-team base "do I know it" before the fame bonus (see decideAnswer). */
  fameBaseTeam: number;
}
export const DIFFICULTY: Record<Difficulty, DiffParams> = {
  // slow + often unsure; still occasionally finds obvious answers.
  easy:   { delayMs: [9000, 17000], knowBase: 0.30, fameBaseTeam: 0.18 },
  // mid tempo → knows famous crossovers, misses obscure ones.
  medium: { delayMs: [4500, 10500], knowBase: 0.62, fameBaseTeam: 0.48 },
  // strong but fallible. Even hard bots must not automatically know the answer.
  hard:   { delayMs: [1800, 7600],  knowBase: 0.84, fameBaseTeam: 0.78 },
};
// Guard against the recurring "easy/medium/hard all feel the same" regression:
// throws at module load if the tiers are no longer clearly distinct.
export function validateDifficulty(D: Record<Difficulty, DiffParams> = DIFFICULTY): void {
  const { easy, medium, hard } = D;
  const errs: string[] = [];
  if (!(easy.delayMs[0] < easy.delayMs[1])) errs.push('easy delay band inverted');
  if (!(medium.delayMs[0] < medium.delayMs[1])) errs.push('medium delay band inverted');
  if (!(hard.delayMs[0] < hard.delayMs[1])) errs.push('hard delay band inverted');
  // Median latency must be ordered, but bands may overlap so timings look human.
  const med = (d: DiffParams) => (d.delayMs[0] + d.delayMs[1]) / 2;
  if (!(med(hard) < med(medium) && med(medium) < med(easy))) errs.push('median latency must order hard<medium<easy');
  // Strictly increasing know-rates.
  if (!(easy.knowBase < medium.knowBase && medium.knowBase < hard.knowBase)) errs.push('knowBase must strictly increase easy<medium<hard');
  if (!(easy.fameBaseTeam < medium.fameBaseTeam && medium.fameBaseTeam < hard.fameBaseTeam)) errs.push('fameBaseTeam must strictly increase easy<medium<hard');
  if (hard.knowBase >= 0.96 || hard.fameBaseTeam >= 0.96) errs.push('hard must stay fallible; no tier may always know');
  if (errs.length) throw new Error('BOT DIFFICULTY tiers collapsed — refusing to start:\n  - ' + errs.join('\n  - '));
}
validateDifficulty();

// Yalnız SON ÇARE fallback: ülke-takım seçimi artık VERİ-GÜDÜMLÜ (pickCountryForClub).
// Değerler DB'deki p.nationality ile BİREBİR olmalı — Türkiye DB'de 'Türkiye' saklanır,
// 'Turkey' HİÇBİR oyuncuyla eşleşmez (eski tur-atlama hatasının kaynağıydı).
const POPULAR_COUNTRIES = ['Türkiye', 'Brazil', 'France', 'Argentina', 'Germany', 'Spain', 'Italy', 'Portugal', 'Netherlands', 'England'];
const LETTERS = 'ABCDEFGHIJKLMNOPRSTUVYZ';

export interface BotOptions {
  difficulty?: Difficulty;
  scope?: Scope;
  mode?: GameMode;
  profile?: BotProfile;
  exposeBotToClient?: boolean;
}

type BotEmoteTone = 'neutral' | 'taunt' | 'celebrate' | 'supportive' | 'self_deprecating';

export class BotPlayer implements Transport {
  readonly isBot = true;
  readonly exposeBotToClient: boolean;
  readonly botArchetype?: string;
  readonly botProfileId?: string;
  readonly botSkill?: number;
  readonly botSkillMean?: number;
  readonly botSkillUncertainty?: number;
  private room: Room | null = null;
  private id = '';
  private teams: { teamA: ClubRef; teamB: ClubRef } | null = null;
  private answer: string | null = null;
  private answerPlayerId: number | null = null;
  private timer: NodeJS.Timeout | null = null;
  private readonly minDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly scope: Scope;
  private readonly difficulty: Difficulty;
  private readonly mode: GameMode;
  private readonly profile: BotProfile | null;
  private recentPicks: number[] = []; // last bot team ids (no-repeat within 10)
  // Stored from reveal for new modes
  private revealCountry?: string;
  private revealLetter?: string;
  // Ülke-takım: bu turdaki rolüm ve seçtim-mi bayrağı (reaktif, çift-seçim koruması)
  private ctRole: string = 'team';
  private ctPicked = false;
  private questionDifficulty: QuestionDifficulty = 'normal';
  private answerKnown = false;
  private wrongGuess: string | null = null;
  private lastGuessDelayMs = 0;
  private emoteTimer: NodeJS.Timeout | null = null;
  private questionEstimate: QuestionDifficultyEstimate | null = null;
  private botDecision: BotDecision | null = null;
  private rng: RandomSource = mathRandom;
  private cognitiveState: BotCognitiveState | null = null;
  private decisionSerial = 0;
  private actionSerial = 0;
  private botScore = 0;
  private opponentScore = 0;
  private guessPhaseStartedAt = 0;

  constructor(opts: BotOptions = {}) {
    this.exposeBotToClient = opts.exposeBotToClient ?? true;
    this.profile = opts.profile ?? null;
    this.botProfileId = this.profile?.id;
    this.botArchetype = this.profile?.behaviorArchetype;
    this.botSkill = this.profile?.skillRating;
    this.botSkillMean = this.profile?.skillMean;
    this.botSkillUncertainty = this.profile?.skillUncertainty;
    this.difficulty = opts.difficulty ?? opts.profile?.difficulty ?? 'medium';
    const [min, max] = DIFFICULTY[this.difficulty].delayMs;
    this.minDelayMs = min;
    this.maxDelayMs = max;
    this.scope = opts.scope ?? { type: 'all' };
    this.mode = opts.mode ?? 'team-team';
  }

  getArchetype(): BotArchetype | null { return this.profile?.behaviorArchetype ?? null; }
  getSkillRating(): number | null { return this.profile?.skillRating ?? null; }
  getSkillMean(): number | null { return this.profile?.skillMean ?? null; }
  getSkillUncertainty(): number | null { return this.profile?.skillUncertainty ?? null; }
  getLastGuessDelayMs(): number { return this.lastGuessDelayMs; }
  getLastCognitiveState(): BotCognitiveState | null { return this.cognitiveState; }
  getLastQuestionDifficultyScore(): number | null { return this.questionEstimate?.difficultyScore ?? null; }
  getLastDecision(): BotDecision | null { return this.botDecision; }
  getBotDifficultyDirector(): NonNullable<BotProfile['difficultyDirector']> | null { return this.profile?.difficultyDirector ?? null; }

  bind(room: Room, id: string): void {
    this.room = room;
    this.id = id;
  }

  send(msg: ServerMsg): void {
    switch (msg.type) {
      case 'pick_phase':
        this.ctRole = msg.pickRole ?? 'team';
        this.ctPicked = false;
        if (this.mode === 'country-team') {
          // VERİ-GÜDÜMLÜ ama bağımsız: bot kendi timer'ı dolunca o anki paylaşılan
          // round state'ini okur ve uyumlu eş seçer; insanın team_picked olayı botu
          // anında tetiklemez. Emniyet: insan çok yavaşsa ~7sn'de eldeki bilgiyle seç; hiç seçmezse odanın
          // autoPickRemaining'i (10sn) her iki tarafı veri-güdümlü doldurur.
          this.clearTimer();
          this.timer = setTimeout(() => { void this.pickCountryTeamReactive(); }, 6800 + Math.floor(Math.random() * 800));
          break;
        }
        void this.pick(this.ctRole);
        break;
      case 'team_picked':
        // Deliberately no immediate reaction. Country-team bots use their own
        // pick timer and only read the shared pick state when that timer fires.
        break;
      case 'reveal_teams':
        this.teams = { teamA: msg.teamA, teamB: msg.teamB };
        this.revealCountry = (msg as any).country;
        this.revealLetter = (msg as any).letter;
        void this.prepareAnswer();
        break;
      case 'guess_phase':
        this.guessPhaseStartedAt = Date.now();
        this.scheduleGuess();
        break;
      case 'guess_locked':
        // Human answer timing must never feed back into bot speed.
        break;
      case 'wrong_guess':
        if (msg.byId === this.id) this.scheduleRetryAfterOwnWrong(msg.retryAt);
        break;
      case 'pass_locked':
        // Passing is part of the hidden round plan, never a response to a human pass.
        break;
      case 'waiting_ready' as any:
        setTimeout(() => this.act({ type: 'ready' }), 420 + Math.floor(Math.random() * 1600));
        break;
      case 'rematch_requested':
        this.respondToRematch();
        break;
      case 'result':
        this.reactToResult(msg as Extract<ServerMsg, { type: 'result' }>);
        this.reset();
        break;
      case 'opponent_left':
        this.reset();
        break;
      default:
        break;
    }
  }

  private act(msg: ClientMsg): void {
    this.room?.handle(this.id, msg);
  }

  private maybeEmote(ids: string[], chance: number, delay: [number, number] = [500, 1800], tone: BotEmoteTone = 'neutral'): void {
    if (!this.room || this.emoteTimer) return;
    const allowed = this.frustrationAwareEmotes(ids, tone);
    if (!allowed.length || Math.random() > chance * this.emoteChanceScale(tone)) return;
    const id = allowed[Math.floor(Math.random() * allowed.length)]!;
    const ms = delay[0] + Math.floor(Math.random() * Math.max(1, delay[1] - delay[0]));
    this.emoteTimer = setTimeout(() => {
      this.emoteTimer = null;
      this.act({ type: 'send_emote', emoteId: id });
    }, ms);
  }

  private emoteChanceScale(tone: BotEmoteTone): number {
    const suppression = this.profile?.difficultyDirector?.emoteSuppression ?? 0;
    if (tone === 'supportive' || tone === 'self_deprecating') return clamp(1 - suppression * 0.25, 0.40, 1);
    if (tone === 'taunt') return clamp(1 - suppression * 1.15, 0, 1);
    return clamp(1 - suppression * 0.75, 0.10, 1);
  }

  private frustrationAwareEmotes(ids: string[], tone: BotEmoteTone): string[] {
    const suppression = this.profile?.difficultyDirector?.emoteSuppression ?? 0;
    if (suppression < 0.25) return ids;
    const toxic = new Set(['gotcha', 'angry']);
    let allowed = ids.filter((id) => !toxic.has(id));
    if (tone === 'taunt') {
      if (suppression >= 0.70) return [];
      allowed = allowed.filter((id) => id === 'ok' || id === 'smile' || id === 'gg');
    }
    if (tone === 'celebrate' && suppression >= 0.55 && this.botScore >= this.opponentScore) {
      allowed = allowed.filter((id) => id === 'gg' || id === 'ok');
    }
    if (tone === 'self_deprecating' && suppression >= 0.65) {
      allowed = allowed.filter((id) => id === 'gg' || id === 'luck');
    }
    if (allowed.length) return allowed;
    if (tone === 'supportive') return ['gg'];
    return suppression < 0.60 ? ['ok'] : [];
  }

  private reactToResult(msg: Extract<ServerMsg, { type: 'result' }>): void {
    const me = msg.players.find((p) => p.id === this.id);
    const opp = msg.players.find((p) => p.id !== this.id);
    if (!me || !opp) return;
    this.botScore = me.score;
    this.opponentScore = opp.score;
    const emoteScale = this.profile?.emoteFrequency ?? 0.32;
    if (msg.result.answeredById === this.id && msg.result.correct) this.maybeEmote(['smile', 'ok', 'gg'], 0.72 * emoteScale, [500, 1600], 'celebrate');
    else if (msg.result.answeredById && msg.result.answeredById !== this.id && msg.result.correct) this.maybeEmote(me.score + 1 < opp.score ? ['angry', 'cry'] : ['gg', 'congrats'], 0.46 * emoteScale, [700, 1900], me.score + 1 < opp.score ? 'self_deprecating' : 'supportive');
    else if (msg.result.reason === 'passed') this.maybeEmote(['gg', 'luck'], 0.26 * emoteScale, [700, 1800], 'supportive');
    if (msg.matchOver) this.maybeEmote(me.score > opp.score ? ['gg', 'smile', 'ok'] : ['gg', 'cry'], 0.88 * emoteScale, [900, 2400], me.score > opp.score ? 'celebrate' : 'self_deprecating');
  }

  private respondToRematch(): void {
    const acceptP = this.profile?.rematchAcceptance ?? 0.58;
    const accept = Math.random() < acceptP;
    const delay = accept
      ? 850 + Math.floor(Math.random() * 3600)
      : 1200 + Math.floor(Math.random() * 4200);
    setTimeout(() => this.act({ type: 'rematch_response', accept }), delay);
  }

  private async pick(role: string): Promise<void> {
    if (role === 'team') {
      // Wait briefly so the human picks first, then pick from the FIXED difficulty
      // pool (never a random band), preferring a team that crosses over with theirs.
      this.clearTimer();
      this.timer = setTimeout(() => { void this.pickTeam(); }, 1500 + Math.floor(Math.random() * 1500));
      return;
    } else if (role === 'country') {
      const country = POPULAR_COUNTRIES[Math.floor(Math.random() * POPULAR_COUNTRIES.length)]!;
      this.act({ type: 'pick_country', country });
    } else if (role === 'letter') {
      const letter = LETTERS[Math.floor(Math.random() * LETTERS.length)]!;
      this.act({ type: 'pick_letter', letter });
    } else if (role === 'player') {
      const player = await randomPlayer(this.difficulty);
      if (player) this.act({ type: 'pick_player', playerId: player.id });
    }
  }

  // Pick through the room-level fun-matchup selector so all bots share the same
  // match-level niche budget, recency protection and Turkish/global-giant weights.
  private async pickTeam(): Promise<void> {
    const humanTeam = this.room?.otherTeamPick(this.id) ?? null;
    const club = this.room
      ? await this.room.pickBotTeamFor(this.id, this.difficulty, humanTeam, this.recentPicks, this.profile?.favoriteKnowledgeDomains ?? [], this.profile?.behaviorArchetype ?? null)
      : this.scope.type === 'all'
        ? await botPickFromPool(this.difficulty, humanTeam, this.recentPicks)
        : await randomClub(this.scope, this.profile ? 'medium' : this.difficulty);
    if (!club) return;
    this.recentPicks.push(club.id);
    if (this.recentPicks.length > 10) this.recentPicks.shift();
    this.act({ type: 'pick_team', clubId: club.id });
  }

  // Ülke-takım VERİ-GÜDÜMLÜ seçim: insanın bu turdaki seçimini oku, ONA ortak-oyunculu
  // (dolayısıyla ASLA yanlış-atlanmayan) bir eş seç. Rolüm 'country' ise insanın
  // takımından oyuncusu olan bir milliyet; rolüm 'team' ise insanın ülkesinden oyuncusu
  // olan bir kulüp seçerim. İnsan henüz seçmediyse gerçek-değerli güvenli bir fallback
  // kullanılır (yine de doğru DB değeri — asla 'Turkey' gibi uyuşmayan bir sabit değil).
  private async pickCountryTeamReactive(): Promise<void> {
    if (this.ctPicked || !this.room) return;
    this.clearTimer();
    if (this.ctRole === 'country') {
      const humanTeam = this.room.otherTeamPick(this.id); // insanın seçtiği kulüp id (varsa)
      const country = await pickCountryForClub(humanTeam, this.room.usedCountriesList());
      if (this.ctPicked) return;
      this.ctPicked = true;
      this.act({ type: 'pick_country', country });
    } else if (this.ctRole === 'team') {
      const humanCountry = this.room.roundCountryPick(); // insanın seçtiği ülke (varsa)
      const avoid = [...this.room.usedClubIdsList(), ...this.recentPicks];
      let club = humanCountry ? await pickClubForCountry(humanCountry, avoid) : null;
      if (!club) {
        // İnsan henüz ülke seçmemiş (nadir) — normal havuz/scope seçimi
        club = this.room
          ? await this.room.pickBotTeamFor(this.id, this.difficulty, null, this.recentPicks, this.profile?.favoriteKnowledgeDomains ?? [], this.profile?.behaviorArchetype ?? null)
          : this.scope.type === 'all'
            ? await botPickFromPool(this.difficulty, null, this.recentPicks)
            : await randomClub(this.scope, this.profile ? 'medium' : this.difficulty);
      }
      if (!club || this.ctPicked) return;
      this.ctPicked = true;
      this.recentPicks.push(club.id);
      if (this.recentPicks.length > 10) this.recentPicks.shift();
      this.act({ type: 'pick_team', clubId: club.id });
    }
  }

  private async prepareAnswer(): Promise<void> {
    if (!this.teams) return;
    this.wrongGuess = null;
    this.answer = null;
    this.answerPlayerId = null;
    this.answerKnown = false;
    this.botDecision = null;
    this.cognitiveState = null;
    this.questionEstimate = null;

    if (this.mode === 'player-player') {
      const clubs = await commonClubs(this.teams.teamA.id, this.teams.teamB.id, 6);
      const wrongs = await plausibleWrongClubsPlayerPlayer(this.teams.teamA.id, this.teams.teamB.id);
      await this.decidePreparedAnswer(clubs.map((c) => c.name), wrongs, 'player_history');
    } else if (this.revealCountry && this.teams.teamB) {
      const players = await getValidPlayersForCountryAndClub(this.teams.teamB.id, this.revealCountry, 8);
      log.info('country_team_bot_candidate_count', {
        countryId: this.revealCountry,
        clubId: this.teams.teamB.id,
        candidateCount: players.length,
      });
      if (players.length === 0) {
        log.warn('country_team_bot_no_valid_answer', {
          countryId: this.revealCountry,
          clubId: this.teams.teamB.id,
          action: 'NO_ANSWER',
        });
      }
      await this.decidePreparedAnswer(players.map((p) => p.canonicalName), [], 'national_teams', { countryTeamPlayers: players });
    } else if (this.revealLetter && this.teams.teamB) {
      const players = await commonPlayersLetterTeam(this.teams.teamB.id, this.revealLetter, 6);
      const wrongs = await plausibleWrongPlayersLetterTeam(this.teams.teamB.id, this.revealLetter);
      await this.decidePreparedAnswer(players.map((p) => p.name), wrongs, 'journeymen');
    } else {
      const ranked = await botCommonPlayersRanked(this.teams.teamA.id, this.teams.teamB.id, 8);
      const wrongs = await plausibleWrongPlayersTeamTeam(this.teams.teamA.id, this.teams.teamB.id);
      await this.decidePreparedAnswer(ranked.map((p) => p.name), wrongs, this.domainForTeams());
    }
  }

  private async decidePreparedAnswer(
    validNames: string[],
    wrongCandidates: string[],
    domain: import('../matchmaking/botProfiles.ts').KnowledgeDomain,
    opts: { countryTeamPlayers?: CountryTeamAnswerCandidate[] } = {},
  ): Promise<void> {
    if (!this.teams) return;
    this.questionEstimate = await getQuestionDifficulty(this.mode, this.teams.teamA.id, this.teams.teamB.id, this.revealCountry ?? this.revealLetter ?? null);
    this.questionDifficulty = difficultyFromScore(this.questionEstimate.difficultyScore);
    const countryTeamPlayers = opts.countryTeamPlayers;
    const pickCountryTeamAnswer = (rng: RandomSource): CountryTeamAnswerCandidate | null => {
      if (!countryTeamPlayers?.length) return null;
      return pick(rng, countryTeamPlayers) ?? null;
    };
    if (this.profile) {
      this.rng = rngForBotRound(this.profile, ++this.decisionSerial, this.questionEstimate.questionKey);
      this.botDecision = decideBotAnswer(this.profile, {
        difficultyScore: this.questionEstimate.difficultyScore,
        answerPopularity: this.questionEstimate.answerPopularity,
        domain,
        botScore: this.botScore,
        opponentScore: this.opponentScore,
        answerTextLength: representativeAnswerLength(validNames, wrongCandidates),
        rng: this.rng,
      });
      this.cognitiveState = this.botDecision.cognitiveState;
      this.answerKnown = this.botDecision.knowsAnswer;
      if (countryTeamPlayers) {
        const selected = this.botDecision.willAnswer && !this.botDecision.shouldMistake ? pickCountryTeamAnswer(this.rng) : null;
        this.answer = selected?.canonicalName ?? null;
        this.answerPlayerId = selected?.playerId ?? null;
        this.wrongGuess = null;
        if (this.botDecision.willAnswer && this.botDecision.shouldMistake) {
          log.info('country_team_bot_invalid_candidate_rejected', {
            countryId: this.revealCountry,
            clubId: this.teams.teamB.id,
            finalValid: false,
            action: 'REJECTED',
          });
        }
        return;
      }
      this.answer = this.botDecision.willAnswer && !this.botDecision.shouldMistake ? (pick(this.rng, validNames) ?? null) : null;
      this.wrongGuess = this.botDecision.willAnswer && this.botDecision.shouldMistake ? pickWrongName(this.rng, wrongCandidates, validNames) : null;
      return;
    }
    this.answerKnown = this.legacyKnows(validNames.length, this.questionEstimate.answerPopularity);
    if (countryTeamPlayers) {
      const selected = this.answerKnown ? pickCountryTeamAnswer(mathRandom) : null;
      this.answer = selected?.canonicalName ?? null;
      this.answerPlayerId = selected?.playerId ?? null;
      this.wrongGuess = null;
      return;
    }
    this.answer = this.answerKnown ? this.pickName(validNames) : null;
    this.wrongGuess = !this.answerKnown && Math.random() < 0.08 + difficultyScore(this.questionDifficulty) * 0.12 ? this.pickWrongGuess(validNames, wrongCandidates) : null;
  }

  // Difficulty-based "do I know it" chance for modes without a fame signal.
  private legacyKnows(answerCount: number, popularity: number): boolean {
    const base = DIFFICULTY[this.difficulty].knowBase;
    const abundance = Math.max(0, Math.min(0.18, answerCount * 0.025));
    const p = Math.max(0.02, Math.min(0.92, base + abundance + popularity * 0.10 - difficultyScore(this.questionDifficulty) * 0.18));
    return Math.random() < p;
  }
  private pickName(names: string[]): string | null {
    return names.length ? names[Math.floor(Math.random() * names.length)]! : null;
  }

  private domainForTeams(): import('../matchmaking/botProfiles.ts').KnowledgeDomain {
    const a = this.teams?.teamA.name.toLocaleLowerCase('tr-TR') ?? '';
    const b = this.teams?.teamB.name.toLocaleLowerCase('tr-TR') ?? '';
    if (/galatasaray|fenerbah|besiktas|trabzon|basaksehir|konyaspor/.test(`${a} ${b}`)) return 'turkey';
    if (/real madrid|barcelona|manchester|liverpool|arsenal|chelsea|bayern|juventus|inter|milan|psg/.test(`${a} ${b}`)) return 'europe_elite';
    return 'journeymen';
  }

  private scheduleGuess(): void {
    this.clearTimer();
    const span = Math.max(0, this.maxDelayMs - this.minDelayMs);
    const delay = this.profile
      ? (this.botDecision?.plannedActionAtMs ?? this.profile.responseMedianMs)
      : this.minDelayMs + Math.floor(span * triangular(mathRandom));
    this.lastGuessDelayMs = delay;
    const serial = ++this.actionSerial;
    this.timer = setTimeout(() => {
      void this.executePlannedAction(serial);
    }, delay);
  }

  private async executePlannedAction(serial: number): Promise<void> {
    if (serial !== this.actionSerial || !this.room?.canBotAct(this.id)) return;
    const action = this.botDecision?.plannedAction;
    if (action === 'PASS') {
      this.act({ type: 'pass' });
      return;
    }
    if (action === 'THINK_UNTIL_TIMEOUT') return;
    await this.submitScheduledGuess(serial);
  }

  private async submitScheduledGuess(serial = this.actionSerial): Promise<void> {
    if (serial !== this.actionSerial || !this.room?.canBotAct(this.id)) return;
    if (this.botDecision && !this.botDecision.willAnswer) return;
    // Yanlış tahminler de insan gibi kısaltılır — ham kanonik isim sızmaz.
    const text = this.wrongGuess ? this.humanizeKnownAnswer(this.wrongGuess) : this.humanizeKnownAnswer(this.answer);
    if (!text) return;
    if (this.mode === 'country-team') {
      const safeText = await this.validatedCountryTeamSubmission(text);
      if (!safeText) return;
      this.act({ type: 'submit_guess', text: safeText });
      return;
    }
    this.act({ type: 'submit_guess', text });
  }

  private scheduleRetryAfterOwnWrong(retryAt?: number): void {
    const plan = this.botDecision?.retryPlan;
    if (!plan?.enabled || !this.answer) return;
    this.clearTimer();
    const serial = ++this.actionSerial;
    const plannedDelay = plan.delayMs;
    const serverDelay = retryAt ? Math.max(0, retryAt - Date.now()) : 0;
    const delay = Math.max(plannedDelay, serverDelay) + Math.floor(this.rng.next() * 280);
    this.timer = setTimeout(() => {
      if (serial !== this.actionSerial || !this.room?.canBotAct(this.id)) return;
      if (plan.nextAction === 'CORRECT_ANSWER') {
        this.wrongGuess = null;
        void this.submitScheduledGuess(serial);
      } else if (plan.nextAction === 'PASS') {
        this.act({ type: 'pass' });
      }
    }, delay);
  }

  private async validatedCountryTeamSubmission(text: string): Promise<string | null> {
    const result = await validateCountryTeamBotCandidate({
      countryId: this.revealCountry ?? null,
      clubId: this.teams?.teamB?.id ?? null,
      candidatePlayerId: this.answerPlayerId,
      candidateText: text,
    });
    return result.submitText;
  }

  private humanizeKnownAnswer(answer: string | null): string | null {
    if (!answer || !this.profile) return answer;
    // Real players often rely on the verifier's autocorrect: surname/first-name or
    // one dropped letter feels human, while the canonical full name every time does not.
    const tokens = answer.split(/\s+/).map((t) => t.trim()).filter((t) => normalize(t).length >= 4);
    if (!tokens.length) return answer;
    const p = this.profile;
    // 2026-08-26: bot HER ZAMAN otomatik tamamlama kullanıyormuş gibi yazar —
    // tam kanonik isim ("Kevin-Prince Boateng") asla; soyad ("Boateng") gider.
    const typoChance = p.behaviorArchetype === 'FAST_RISKY' ? 0.20
      : p.behaviorArchetype === 'STRONG' ? 0.08
        : p.behaviorArchetype === 'CASUAL' ? 0.07
          : 0.10;
    const rng = this.profile ? this.rng : mathRandom;
    let text = this.shortHumanAnswer(tokens, rng);
    if (rng.next() < 0.42) text = text.toLocaleLowerCase('tr-TR');
    if (rng.next() < typoChance) text = this.safeTypo(text, rng);
    return text;
  }

  private shortHumanAnswer(tokens: string[], rng: RandomSource): string {
    const lower = tokens.map((t) => t.toLocaleLowerCase('tr-TR'));
    const surnameParticles = new Set(['de', 'da', 'di', 'van', 'von', 'der', 'den', 'del', 'dos', 'bin', 'el']);
    if (tokens.length >= 2 && surnameParticles.has(lower[tokens.length - 2]!)) {
      return `${tokens[tokens.length - 2]} ${tokens[tokens.length - 1]}`;
    }
    if (tokens.length >= 3 && surnameParticles.has(lower[tokens.length - 3]!)) {
      return `${tokens[tokens.length - 3]} ${tokens[tokens.length - 2]} ${tokens[tokens.length - 1]}`;
    }
    // Yalnız soyad: ilk-ad/tam-ad varyantları kaldırıldı (2026-08-26) — insanlar
    // arama kutusuna soyadı yazar, otomatik tamamlama gerisini halleder.
    return tokens[tokens.length - 1]!;
  }

  private safeTypo(text: string, rng: RandomSource = mathRandom): string {
    const chars = [...text];
    const letterIdx = chars.map((c, i) => (/^[A-Za-zÇĞİÖŞÜçğıöşü]$/.test(c) ? i : -1)).filter((i) => i >= 0);
    if (letterIdx.length < 5) return text;
    const idx = letterIdx[1 + Math.floor(rng.next() * Math.max(1, letterIdx.length - 2))]!;
    if (rng.next() < 0.55) chars.splice(idx, 1);
    else chars[idx] = chars[idx]!.toLocaleLowerCase('tr-TR');
    return chars.join('');
  }

  private pickWrongGuess(validNames: string[], candidates: string[] = []): string | null {
    const names = candidates.length ? candidates : ['Hakan', 'Emre', 'Alex', 'Arda', 'Burak', 'Drogba', 'Ronaldo', 'Nani', 'Turan', 'Mertens', 'Sosa', 'Talisca'];
    const valid = new Set(validNames.map((n) => n.toLowerCase()));
    const pool = names.filter((n) => !valid.has(n.toLowerCase()));
    return pool.length ? pool[Math.floor(Math.random() * pool.length)]! : null;
  }

  private reset(): void {
    this.clearTimer();
    this.teams = null;
    this.answer = null;
    this.answerPlayerId = null;
    this.revealCountry = undefined;
    this.revealLetter = undefined;
    this.ctPicked = false;
    this.questionDifficulty = 'normal';
    this.answerKnown = false;
    this.wrongGuess = null;
    this.lastGuessDelayMs = 0;
    this.questionEstimate = null;
    this.botDecision = null;
    this.cognitiveState = null;
    this.guessPhaseStartedAt = 0;
    this.actionSerial += 1;
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.emoteTimer) {
      clearTimeout(this.emoteTimer);
      this.emoteTimer = null;
    }
  }
}

function representativeAnswerLength(validNames: string[], wrongCandidates: string[]): number {
  const first = validNames[0] ?? wrongCandidates[0];
  if (!first) return 11;
  return Math.max(4, Math.min(24, first.length));
}
