import type { Room, Transport } from './room.ts';
import type { ClientMsg, ClubRef, Difficulty, GameMode, ServerMsg, Scope } from '../protocol.ts';
import { randomClub, commonPlayers, commonPlayersCountryTeam, commonPlayersLetterTeam } from '../game/verify.ts';

// Bot answer delay (ms) per difficulty — how long you get to beat it.
const DELAYS: Record<Difficulty, [number, number]> = {
  easy: [9000, 16000],
  medium: [4000, 9000],
  hard: [1500, 4000],
};

const POPULAR_COUNTRIES = ['Turkey', 'Brazil', 'France', 'Argentina', 'Germany', 'Spain', 'Italy', 'Portugal', 'Netherlands', 'England'];
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
  // Stored from reveal for new modes
  private revealCountry?: string;
  private revealLetter?: string;

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
        void this.pick(msg.pickRole ?? 'team');
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
      const club = await randomClub(this.scope, this.difficulty);
      if (club) this.act({ type: 'pick_team', clubId: club.id });
    } else if (role === 'country') {
      const country = POPULAR_COUNTRIES[Math.floor(Math.random() * POPULAR_COUNTRIES.length)]!;
      this.act({ type: 'pick_country', country });
    } else if (role === 'letter') {
      const letter = LETTERS[Math.floor(Math.random() * LETTERS.length)]!;
      this.act({ type: 'pick_letter', letter });
    }
  }

  private async prepareAnswer(): Promise<void> {
    if (!this.teams) return;

    let names: string[];
    if (this.revealCountry && this.teams.teamB) {
      // Country-team: find players of that country who played for the team
      const players = await commonPlayersCountryTeam(this.teams.teamB.id, this.revealCountry, 6);
      names = players.map((p) => p.name);
    } else if (this.revealLetter && this.teams.teamB) {
      // Letter-team: find players whose name starts with that letter at the team
      const players = await commonPlayersLetterTeam(this.teams.teamB.id, this.revealLetter, 6);
      names = players.map((p) => p.name);
    } else {
      // Team-team: standard
      names = await commonPlayers(this.teams.teamA.id, this.teams.teamB.id, 6);
    }
    this.answer = names.length ? names[Math.floor(Math.random() * names.length)]! : null;
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
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
