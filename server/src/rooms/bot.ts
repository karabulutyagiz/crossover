import type { Room, Transport } from './room.ts';
import type { ClientMsg, ClubRef, Difficulty, GameMode, ServerMsg, Scope } from '../protocol.ts';
import { randomClub, botPickFromPool, randomPlayer, botCommonPlayersRanked, commonPlayersCountryTeam, commonPlayersLetterTeam, commonClubs, pickCountryForClub, pickClubForCountry } from '../game/verify.ts';

// Bot answer delay (ms) per difficulty — how long you get to beat it. HARD knows
// the answer but no longer rushes, so the human still has a chance to compete.
const DELAYS: Record<Difficulty, [number, number]> = {
  easy: [9000, 16000],
  medium: [4000, 9000],
  hard: [4500, 8500],
};

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
    const [min, max] = DELAYS[this.difficulty];
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
    if (this.difficulty === 'hard') return true;
    return Math.random() < (this.difficulty === 'medium' ? 0.65 : 0.35);
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
    const base = this.difficulty === 'medium' ? 0.45 : 0.20;
    if (Math.random() > base + 0.45 * fameNorm) return null;
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
