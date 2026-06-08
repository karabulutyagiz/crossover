import type { Room, Transport } from './room.ts';
import type { ClientMsg, ClubRef, Difficulty, ServerMsg, Scope } from '../protocol.ts';
import { randomClub, commonPlayers } from '../game/verify.ts';

// Bot answer delay (ms) per difficulty — how long you get to beat it.
const DELAYS: Record<Difficulty, [number, number]> = {
  easy: [9000, 16000],
  medium: [4000, 9000],
  hard: [1500, 4000],
};

export interface BotOptions {
  difficulty?: Difficulty;
  scope?: Scope;
}

/**
 * An in-process opponent that plugs into a Room as a Transport. It reacts to the
 * same server messages a real client gets: picks a random club, looks up a real
 * player who played for both revealed teams, and answers after a delay (so the
 * human has a chance to win first). Stays silent if no common player exists.
 */
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

  constructor(opts: BotOptions = {}) {
    this.difficulty = opts.difficulty ?? 'medium';
    const [min, max] = DELAYS[this.difficulty];
    this.minDelayMs = min;
    this.maxDelayMs = max;
    this.scope = opts.scope ?? { type: 'all' };
  }

  bind(room: Room, id: string): void {
    this.room = room;
    this.id = id;
  }

  send(msg: ServerMsg): void {
    switch (msg.type) {
      case 'pick_phase':
        void this.pick();
        break;
      case 'reveal_teams':
        this.teams = { teamA: msg.teamA, teamB: msg.teamB };
        void this.prepareAnswer();
        break;
      case 'guess_phase':
        this.scheduleGuess();
        break;
      case 'rematch_requested':
        // The human wants to play again — a practice bot always says yes.
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

  private async pick(): Promise<void> {
    const club = await randomClub(this.scope, this.difficulty);
    if (club) this.act({ type: 'pick_team', clubId: club.id });
  }

  private async prepareAnswer(): Promise<void> {
    if (!this.teams) return;
    const names = await commonPlayers(this.teams.teamA.id, this.teams.teamB.id, 6);
    this.answer = names.length ? names[Math.floor(Math.random() * names.length)]! : null;
  }

  private scheduleGuess(): void {
    this.clearTimer();
    const span = Math.max(0, this.maxDelayMs - this.minDelayMs);
    const delay = this.minDelayMs + Math.floor(Math.random() * (span + 1));
    this.timer = setTimeout(() => {
      // Re-check at fire time: the human may have already locked the round, and
      // the answer lookup has finished by now.
      if (this.answer) this.act({ type: 'submit_guess', text: this.answer });
    }, delay);
  }

  private reset(): void {
    this.clearTimer();
    this.teams = null;
    this.answer = null;
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
