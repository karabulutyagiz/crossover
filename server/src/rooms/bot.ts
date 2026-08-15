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
import { mathRandom, pick, triangular, type RandomSource } from '../matchmaking/random.ts';
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
}

export class BotPlayer implements Transport {
  readonly isBot = true;
  readonly botArchetype?: string;
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
  private botScore = 0;
  private opponentScore = 0;
  private guessPhaseStartedAt = 0;
  private previousOpponentTempoMs: number | null = null;

  constructor(opts: BotOptions = {}) {
    this.profile = opts.profile ?? null;
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
          // VERİ-GÜDÜMLÜ + REAKTİF: insanın seçimini bekle ('team_picked'), sonra ONA
          // UYUMLU (ortak-oyunculu) eşi seç → tur ASLA yanlış atlanmaz. Emniyet:
          // insan çok yavaşsa ~7sn'de eldeki bilgiyle seç; hiç seçmezse odanın
          // autoPickRemaining'i (10sn) her iki tarafı veri-güdümlü doldurur.
          this.clearTimer();
          this.timer = setTimeout(() => { void this.pickCountryTeamReactive(); }, 6800 + Math.floor(Math.random() * 800));
          break;
        }
        void this.pick(this.ctRole);
        break;
      case 'team_picked':
        // Ülke-takımda rakip (insan) seçince ANINDA uyumlu eşimizi seçelim.
        if (this.mode === 'country-team' && (msg as any).playerId !== this.id && !this.ctPicked) {
          void this.pickCountryTeamReactive();
        }
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
        if ((msg as any).byId !== this.id && this.guessPhaseStartedAt > 0) {
          this.previousOpponentTempoMs = Date.now() - this.guessPhaseStartedAt;
        }
        break;
      case 'wrong_guess':
        if (msg.byId !== this.id) this.maybeEmote(['gotcha', 'smile', 'ok'], 0.34, [420, 1400]);
        break;
      case 'pass_locked':
        // Opponent passed. Agree to pass too (voiding the round) with a
        // difficulty-based chance — easier bots skip along more readily.
        if (msg.byId !== this.id) {
          const agreeChance = this.difficulty === 'easy' ? 0.8 : this.difficulty === 'medium' ? 0.5 : 0.25;
          if (Math.random() < agreeChance) {
            this.clearTimer();
            this.act({ type: 'pass' });
          }
        }
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

  private maybeEmote(ids: string[], chance: number, delay: [number, number] = [500, 1800]): void {
    if (!this.room || this.emoteTimer || Math.random() > chance) return;
    const id = ids[Math.floor(Math.random() * ids.length)]!;
    const ms = delay[0] + Math.floor(Math.random() * Math.max(1, delay[1] - delay[0]));
    this.emoteTimer = setTimeout(() => {
      this.emoteTimer = null;
      this.act({ type: 'send_emote', emoteId: id });
    }, ms);
  }

  private reactToResult(msg: Extract<ServerMsg, { type: 'result' }>): void {
    const me = msg.players.find((p) => p.id === this.id);
    const opp = msg.players.find((p) => p.id !== this.id);
    if (!me || !opp) return;
    this.botScore = me.score;
    this.opponentScore = opp.score;
    const emoteScale = this.profile?.emoteFrequency ?? 0.32;
    if (msg.result.answeredById === this.id && msg.result.correct) this.maybeEmote(['smile', 'ok', 'gg'], 0.72 * emoteScale, [500, 1600]);
    else if (msg.result.answeredById && msg.result.answeredById !== this.id && msg.result.correct) this.maybeEmote(me.score + 1 < opp.score ? ['angry', 'cry'] : ['gg', 'congrats'], 0.46 * emoteScale, [700, 1900]);
    else if (msg.result.reason === 'passed') this.maybeEmote(['gg', 'luck'], 0.26 * emoteScale, [700, 1800]);
    if (msg.matchOver) this.maybeEmote(me.score > opp.score ? ['gg', 'smile', 'ok'] : ['gg', 'cry'], 0.88 * emoteScale, [900, 2400]);
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

  // Pick the bot's team strictly from its difficulty pool (league-scoped solo games
  // keep the popularity picker so the pick stays inside the chosen league).
  private async pickTeam(): Promise<void> {
    const humanTeam = this.room?.otherTeamPick(this.id) ?? null;
    const club = this.scope.type === 'all'
      ? await botPickFromPool(this.difficulty, humanTeam, this.recentPicks)
      : await randomClub(this.scope, this.difficulty);
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
        club = this.scope.type === 'all'
          ? await botPickFromPool(this.difficulty, null, this.recentPicks)
          : await randomClub(this.scope, this.difficulty);
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
        previousTempoMs: this.previousOpponentTempoMs,
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
      ? (this.botDecision?.reactionDelayMs ?? this.profile.responseMedianMs)
      : this.minDelayMs + Math.floor(span * triangular(mathRandom));
    this.lastGuessDelayMs = delay;
    this.timer = setTimeout(() => {
      void this.submitScheduledGuess();
    }, delay);
  }

  private async submitScheduledGuess(): Promise<void> {
    if (this.botDecision && !this.botDecision.willAnswer) return;
    const text = this.wrongGuess ?? this.humanizeKnownAnswer(this.answer);
    if (!text) return;
    if (this.mode === 'country-team') {
      const safeText = await this.validatedCountryTeamSubmission(text);
      if (!safeText) return;
      this.act({ type: 'submit_guess', text: safeText });
      return;
    }
    this.act({ type: 'submit_guess', text });
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
    const shortChance = p.behaviorArchetype === 'STRONG' ? 0.76
      : p.behaviorArchetype === 'CAREFUL' ? 0.46
        : p.behaviorArchetype === 'CASUAL' ? 0.28
          : 0.56;
    const typoChance = p.behaviorArchetype === 'FAST_RISKY' ? 0.30
      : p.behaviorArchetype === 'STRONG' ? 0.18
        : p.behaviorArchetype === 'CASUAL' ? 0.10
          : 0.16;
    let text = answer;
    const rng = this.profile ? this.rng : mathRandom;
    if (rng.next() < shortChance) {
      const surname = tokens[tokens.length - 1]!;
      const first = tokens[0]!;
      text = rng.next() < 0.62 ? surname : first;
    }
    if (rng.next() < typoChance) text = this.safeTypo(text, rng);
    return text;
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
