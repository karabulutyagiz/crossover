import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.ts';
import { verifyGuess, searchClubs, commonPlayersDetailed } from '../game/verify.ts';
import type {
  ClientMsg,
  ServerMsg,
  PlayerView,
  RoomStatus,
  RoomView,
  ClubRef,
  RoundResult,
  Scope,
} from '../protocol.ts';

const COUNTDOWN_FROM = 3;
const GUESS_MS = 30_000;
const MAX_PLAYERS = 2;

// A player's link to the outside world: a real WebSocket client, or a bot.
export interface Transport {
  send(msg: ServerMsg): void;
  readonly isBot: boolean;
}

interface Player {
  id: string;
  name: string;
  transport: Transport;
  score: number;
  isHost: boolean;
  connected: boolean;
}

interface Round {
  picks: Map<string, ClubRef>;
  teamA?: ClubRef;
  teamB?: ClubRef;
  answeredBy?: string;
  finished: boolean;
}

export class Room {
  readonly code: string;
  scope: Scope = { type: 'all' }; // which clubs are allowed (set at creation)
  private players = new Map<string, Player>();
  status: RoomStatus = 'lobby';
  private round: Round | null = null;
  private timers: NodeJS.Timeout[] = [];
  private onEmpty: (code: string) => void;

  constructor(code: string, onEmpty: (code: string) => void) {
    this.code = code;
    this.onEmpty = onEmpty;
  }

  // ---- membership ----
  addPlayer(
    name: string,
    transport: Transport,
    asHost: boolean,
  ): { ok: true; id: string } | { ok: false; error: string } {
    if (this.players.size >= MAX_PLAYERS) return { ok: false, error: 'Room is full' };
    const id = randomUUID();
    this.players.set(id, {
      id,
      name: name.trim() || 'Player',
      transport,
      score: 0,
      isHost: asHost,
      connected: true,
    });
    this.broadcastState();
    return { ok: true, id };
  }

  handleClose(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p) return;
    this.clearTimers();
    this.players.delete(playerId);

    // If nobody human is left, tear the room (and its bot) down.
    const humansLeft = [...this.players.values()].some((pl) => !pl.transport.isBot);
    if (this.players.size === 0 || !humansLeft) {
      this.players.clear();
      this.onEmpty(this.code);
      return;
    }
    this.status = 'lobby';
    this.round = null;
    this.broadcast({ type: 'opponent_left' });
    this.broadcastState();
  }

  // ---- message routing ----
  handle(playerId: string, msg: ClientMsg): void {
    switch (msg.type) {
      case 'start':
        return this.start(playerId);
      case 'pick_team':
        return this.handlePick(playerId, msg.clubId);
      case 'submit_guess':
        return this.handleGuess(playerId, msg.text);
      case 'play_again':
        return this.playAgain();
      case 'search_clubs':
        return void this.handleSearch(playerId, msg.reqId, msg.q);
      default:
        this.sendTo(playerId, { type: 'error', message: 'Unexpected message' });
    }
  }

  // ---- game flow ----
  private start(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p?.isHost) return this.sendTo(playerId, { type: 'error', message: 'Only the host can start' });
    if (this.players.size < MAX_PLAYERS)
      return this.sendTo(playerId, { type: 'error', message: 'Need 2 players to start' });
    if (this.status !== 'lobby' && this.status !== 'result')
      return this.sendTo(playerId, { type: 'error', message: 'Game already in progress' });
    this.beginCountdown();
  }

  private beginCountdown(): void {
    this.clearTimers();
    this.round = { picks: new Map(), finished: false };
    this.status = 'countdown';
    this.broadcastState();

    let n = COUNTDOWN_FROM;
    this.broadcast({ type: 'countdown', n });
    const tick = setInterval(() => {
      n -= 1;
      if (n > 0) {
        this.broadcast({ type: 'countdown', n });
      } else {
        clearInterval(tick);
        this.beginPick();
      }
    }, 1000);
    this.timers.push(tick);
  }

  private beginPick(): void {
    this.status = 'pick';
    this.broadcastState();
    this.broadcast({ type: 'pick_phase' });
  }

  private handlePick(playerId: string, clubId: number): void {
    if (this.status !== 'pick' || !this.round) return;
    if (this.round.picks.has(playerId)) return;
    void this.lockPick(playerId, clubId);
  }

  private async lockPick(playerId: string, clubId: number): Promise<void> {
    const club = await this.clubById(clubId);
    if (!club) return this.sendTo(playerId, { type: 'error', message: 'Unknown club' });
    if (!this.round || this.status !== 'pick' || this.round.picks.has(playerId)) return;
    this.round.picks.set(playerId, club);
    this.broadcast({ type: 'team_picked', playerId });
    if (this.round.picks.size === MAX_PLAYERS) this.beginReveal();
  }

  private beginReveal(): void {
    if (!this.round) return;
    const ids = [...this.players.keys()];
    const a = this.round.picks.get(ids[0]!)!;
    const b = this.round.picks.get(ids[1]!)!;
    this.round.teamA = a;
    this.round.teamB = b;
    this.status = 'reveal';
    this.broadcastState();
    this.broadcast({ type: 'reveal_teams', teamA: a, teamB: b });
    const t = setTimeout(() => this.beginGuess(), 2000);
    this.timers.push(t);
  }

  private beginGuess(): void {
    if (!this.round) return;
    this.status = 'guess';
    this.broadcastState();
    const endsAt = Date.now() + GUESS_MS;
    this.broadcast({ type: 'guess_phase', endsAt });
    const t = setTimeout(() => this.endRoundTimeout(), GUESS_MS);
    this.timers.push(t);
  }

  private handleGuess(playerId: string, text: string): void {
    if (this.status !== 'guess' || !this.round || this.round.finished) return;
    if (this.round.answeredBy) return; // first answer locks the round
    this.round.answeredBy = playerId;
    const p = this.players.get(playerId);
    this.broadcast({ type: 'guess_locked', byId: playerId, byName: p?.name ?? '' });
    void this.evaluate(playerId, text);
  }

  private async evaluate(playerId: string, text: string): Promise<void> {
    if (!this.round?.teamA || !this.round.teamB) return;
    this.clearTimers();
    const v = await verifyGuess(this.round.teamA.id, this.round.teamB.id, text);
    const p = this.players.get(playerId);
    if (v.correct && p) p.score += 1;

    // Always show common players so users learn who played for both teams
    const common = await commonPlayersDetailed(this.round.teamA.id, this.round.teamB.id, 5);

    this.finishRound({
      correct: v.correct,
      reason: v.reason,
      autocorrected: v.autocorrected,
      answeredById: playerId,
      answeredByName: p?.name ?? null,
      guess: text,
      teamA: v.teamA,
      teamB: v.teamB,
      matchedPlayerName: v.matchedPlayer?.name ?? null,
      matchedPlayerImageUrl: v.matchedPlayer?.imageUrl ?? null,
      spellsA: v.spellsA,
      spellsB: v.spellsB,
      allClubs: v.allClubs,
      commonPlayers: common,
    });
  }

  private endRoundTimeout(): void {
    if (!this.round || this.round.finished || !this.round.teamA || !this.round.teamB) return;
    void this.endRoundTimeoutAsync();
  }

  private async endRoundTimeoutAsync(): Promise<void> {
    if (!this.round || this.round.finished || !this.round.teamA || !this.round.teamB) return;
    const common = await commonPlayersDetailed(this.round.teamA.id, this.round.teamB.id, 5);
    this.finishRound({
      correct: false,
      reason: 'timeout',
      autocorrected: false,
      answeredById: null,
      answeredByName: null,
      guess: '',
      teamA: this.round.teamA,
      teamB: this.round.teamB,
      matchedPlayerName: null,
      matchedPlayerImageUrl: null,
      spellsA: [],
      spellsB: [],
      allClubs: [],
      commonPlayers: common,
    });
  }

  private finishRound(result: RoundResult): void {
    if (!this.round) return;
    this.round.finished = true;
    this.clearTimers();
    this.status = 'result';
    this.broadcast({ type: 'result', result, players: this.playerViews() });
    this.broadcastState();
  }

  private playAgain(): void {
    if (this.status !== 'result') return;
    this.beginCountdown();
  }

  private async handleSearch(playerId: string, reqId: string, q: string): Promise<void> {
    const clubs = await searchClubs(q, this.scope, 8);
    this.sendTo(playerId, { type: 'club_results', reqId, clubs });
  }

  // ---- helpers ----
  private async clubById(id: number): Promise<ClubRef | null> {
    const { rows } = await pool.query<{ id: string; name: string; logo_url: string | null }>(
      'SELECT id, name, logo_url FROM clubs WHERE id = $1',
      [id],
    );
    const r = rows[0];
    return r ? { id: Number(r.id), name: r.name, logoUrl: r.logo_url } : null;
  }

  private playerViews(): PlayerView[] {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      isHost: p.isHost,
      connected: p.connected,
    }));
  }

  private toView(youId: string): RoomView {
    return { code: this.code, status: this.status, players: this.playerViews(), youId };
  }

  private broadcastState(): void {
    for (const p of this.players.values()) p.transport.send({ type: 'room_state', room: this.toView(p.id) });
  }

  private broadcast(msg: ServerMsg): void {
    for (const p of this.players.values()) p.transport.send(msg);
  }

  private sendTo(playerId: string, msg: ServerMsg): void {
    this.players.get(playerId)?.transport.send(msg);
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  get size(): number {
    return this.players.size;
  }
}
