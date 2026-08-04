import type { Room, Transport } from './room.ts';
import type { ClientMsg, ClubRef, Difficulty, GameMode, ServerMsg, Scope } from '../protocol.ts';
import { randomClub, botPickFromPool, randomPlayer, botCommonPlayersRanked, commonPlayersCountryTeam, commonPlayersLetterTeam, commonClubs, pickCountryForClub, pickClubForCountry } from '../game/verify.ts';

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
  // slow + often clueless → a beginner wins; the bot hands you most rounds.
  easy:   { delayMs: [10000, 17000], knowBase: 0.30, fameBaseTeam: 0.15 },
  // mid tempo → knows the famous crossovers, misses the obscure ones.
  medium: { delayMs: [5000, 9000],   knowBase: 0.70, fameBaseTeam: 0.50 },
  // fast + always knows → you must buzz almost immediately to win.
  hard:   { delayMs: [2000, 4500],   knowBase: 1.00, fameBaseTeam: 1.00 },
};
// Extra "do I know it" a famous crossover adds on top of fameBaseTeam (team-team).
const FAME_BONUS = 0.30;

// Guard against the recurring "easy/medium/hard all feel the same" regression:
// throws at module load if the tiers are no longer clearly distinct.
export function validateDifficulty(D: Record<Difficulty, DiffParams> = DIFFICULTY): void {
  const { easy, medium, hard } = D;
  const errs: string[] = [];
  if (!(easy.delayMs[0] < easy.delayMs[1])) errs.push('easy delay band inverted');
  if (!(medium.delayMs[0] < medium.delayMs[1])) errs.push('medium delay band inverted');
  if (!(hard.delayMs[0] < hard.delayMs[1])) errs.push('hard delay band inverted');
  // Non-overlapping, strictly ordered latency bands (hard fastest, easy slowest).
  if (!(hard.delayMs[1] <= medium.delayMs[0])) errs.push(`hard.max(${hard.delayMs[1]}) must be <= medium.min(${medium.delayMs[0]})`);
  if (!(medium.delayMs[1] <= easy.delayMs[0])) errs.push(`medium.max(${medium.delayMs[1]}) must be <= easy.min(${easy.delayMs[0]})`);
  // Strictly increasing know-rates.
  if (!(easy.knowBase < medium.knowBase && medium.knowBase < hard.knowBase)) errs.push('knowBase must strictly increase easy<medium<hard');
  if (!(easy.fameBaseTeam < medium.fameBaseTeam && medium.fameBaseTeam < hard.fameBaseTeam)) errs.push('fameBaseTeam must strictly increase easy<medium<hard');
  if (hard.knowBase !== 1 || hard.fameBaseTeam !== 1) errs.push('hard must always know (knowBase=fameBaseTeam=1)');
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
}

export class BotPlayer implements Transport {
  readonly isBot = true;
  private room: Room | null = null;
  private id = '';
  private teams: { teamA: ClubRef; teamB: ClubRef } | null = null;
  private answer: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private readonly minDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly scope: Scope;
  private readonly difficulty: Difficulty;
  private readonly mode: GameMode;
  private recentPicks: number[] = []; // last bot team ids (no-repeat within 10)
  // Stored from reveal for new modes
  private revealCountry?: string;
  private revealLetter?: string;
  // Ülke-takım: bu turdaki rolüm ve seçtim-mi bayrağı (reaktif, çift-seçim koruması)
  private ctRole: string = 'team';
  private ctPicked = false;

  constructor(opts: BotOptions = {}) {
    this.difficulty = opts.difficulty ?? 'medium';
    const [min, max] = DIFFICULTY[this.difficulty].delayMs;
    this.minDelayMs = min;
    this.maxDelayMs = max;
    this.scope = opts.scope ?? { type: 'all' };
    this.mode = opts.mode ?? 'team-team';
  }

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
        this.scheduleGuess();
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
        setTimeout(() => this.act({ type: 'ready' }), 500);
        break;
      case 'rematch_requested':
        this.act({ type: 'rematch_response', accept: true });
        break;
      case 'result':
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

    if (this.mode === 'player-player') {
      const clubs = await commonClubs(this.teams.teamA.id, this.teams.teamB.id, 6);
      this.answer = this.knows() ? this.pickName(clubs.map((c) => c.name)) : null;
    } else if (this.revealCountry && this.teams.teamB) {
      const players = await commonPlayersCountryTeam(this.teams.teamB.id, this.revealCountry, 6);
      this.answer = this.knows() ? this.pickName(players.map((p) => p.name)) : null;
    } else if (this.revealLetter && this.teams.teamB) {
      const players = await commonPlayersLetterTeam(this.teams.teamB.id, this.revealLetter, 6);
      this.answer = this.knows() ? this.pickName(players.map((p) => p.name)) : null;
    } else {
      // Team-team: HARD always knows; EASY/MEDIUM know famous crossovers more often
      // and simply miss obscure ones (human-like), leaving the round for the player.
      const ranked = await botCommonPlayersRanked(this.teams.teamA.id, this.teams.teamB.id, 8);
      this.answer = this.decideAnswer(ranked);
    }
  }

  // Difficulty-based "do I know it" chance for modes without a fame signal.
  private knows(): boolean {
    const p = DIFFICULTY[this.difficulty].knowBase;
    return p >= 1 || Math.random() < p;
  }
  private pickName(names: string[]): string | null {
    return names.length ? names[Math.floor(Math.random() * names.length)]! : null;
  }
  // Team-team: weight the "do I know it" chance by how famous the crossover is.
  private decideAnswer(ranked: { name: string; fame: number }[]): string | null {
    if (!ranked.length) return null;
    if (this.difficulty === 'hard') {
      return ranked[Math.floor(Math.random() * Math.min(3, ranked.length))]!.name;
    }
    const fameNorm = Math.max(0, Math.min(1, (ranked[0]!.fame - 40) / 200));
    const p = DIFFICULTY[this.difficulty].fameBaseTeam + FAME_BONUS * fameNorm;
    if (Math.random() > p) return null;
    const half = ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 2)));
    return half[Math.floor(Math.random() * half.length)]!.name;
  }

  private scheduleGuess(): void {
    this.clearTimer();
    const span = Math.max(0, this.maxDelayMs - this.minDelayMs);
    const delay = this.minDelayMs + Math.floor(Math.random() * (span + 1));
    this.timer = setTimeout(() => {
      if (this.answer) this.act({ type: 'submit_guess', text: this.answer });
    }, delay);
  }

  private reset(): void {
    this.clearTimer();
    this.teams = null;
    this.answer = null;
    this.revealCountry = undefined;
    this.revealLetter = undefined;
    this.ctPicked = false;
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
