import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.ts';
import { verifyGuess, searchClubs, commonPlayersDetailed, randomClub } from '../game/verify.ts';
import { applyMatchResult } from '../game/rank.ts';
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
const PICK_MS = 10_000;
const GUESS_MS = 30_000;
const MAX_PLAYERS = 2;
const WIN_TARGET = 3; // first to this many round wins takes the match
const INTER_ROUND_MS = 5_000; // pause on the result screen before the next round auto-starts

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
  userId?: string; // DB user ID for trophy updates
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
  private matchOver = false; // true once a player reaches WIN_TARGET
  private rematchBy: string | null = null; // who requested a rematch (waiting for the other)

  constructor(code: string, onEmpty: (code: string) => void) {
    this.code = code;
    this.onEmpty = onEmpty;
  }

  // ---- membership ----
  addPlayer(
    name: string,
    transport: Transport,
    asHost: boolean,
    userId?: string,
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
      userId,
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
    this.matchOver = false;
    this.rematchBy = null;
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
        return this.requestRematch(playerId);
      case 'rematch_response':
        return this.respondRematch(playerId, msg.accept);
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
    this.startMatch();
  }

  // Begin a brand-new match: reset both players' scores, then count down.
  private startMatch(): void {
    this.matchOver = false;
    this.rematchBy = null;
    for (const p of this.players.values()) p.score = 0;
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
    const endsAt = Date.now() + PICK_MS;
    this.broadcast({ type: 'pick_phase', endsAt });
    const t = setTimeout(() => this.autoPickRemaining(), PICK_MS);
    this.timers.push(t);
  }

  private async autoPickRemaining(): Promise<void> {
    if (this.status !== 'pick' || !this.round) return;
    for (const [id] of this.players) {
      if (this.round.picks.has(id)) continue;
      const club = await randomClub(this.scope, 'medium');
      if (club) {
        this.round.picks.set(id, club);
        this.broadcast({ type: 'team_picked', playerId: id });
      }
    }
    if (this.round.picks.size === MAX_PLAYERS) this.beginReveal();
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
    void this.afterReveal(a, b);
  }

  // After revealing, check there IS a common player. If none exists, the round
  // can't be won by anyone → skip it (no points) and auto-advance.
  private async afterReveal(a: ClubRef, b: ClubRef): Promise<void> {
    const common = await commonPlayersDetailed(a.id, b.id, 5);
    if (!this.round || this.round.finished || this.status !== 'reveal') return;
    if (common.length === 0) {
      const t = setTimeout(() => this.skipNoCommon(), 2200);
      this.timers.push(t);
    } else {
      const t = setTimeout(() => this.beginGuess(), 2000);
      this.timers.push(t);
    }
  }

  // No player ever played for both clubs → pass the round, award nobody.
  private skipNoCommon(): void {
    if (!this.round || this.round.finished || !this.round.teamA || !this.round.teamB) return;
    this.finishRound({
      correct: false,
      reason: 'no_common',
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
      commonPlayers: [],
    });
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

    // Did someone reach the win target? If so the whole match is over.
    const winner = [...this.players.values()].find((p) => p.score >= WIN_TARGET) ?? null;
    this.matchOver = Boolean(winner);

    this.broadcast({
      type: 'result',
      result,
      players: this.playerViews(),
      matchOver: this.matchOver,
      winnerId: winner?.id ?? null,
      winnerName: winner?.name ?? null,
      target: WIN_TARGET,
    });
    this.broadcastState();

    // Match not decided yet → auto-advance to the next round after a short pause.
    if (!this.matchOver) {
      const t = setTimeout(() => {
        if (this.status === 'result' && !this.matchOver) this.beginCountdown();
      }, INTER_ROUND_MS);
      this.timers.push(t);
    } else {
      // Match is over — update trophies for players with a DB account.
      void this.updateTrophies(winner!);
    }
  }

  // ---- trophy updates ----
  private async updateTrophies(winner: Player): Promise<void> {
    for (const p of this.players.values()) {
      if (p.transport.isBot || !p.userId) continue;
      const won = p.id === winner.id;
      try {
        const { profile, delta } = await applyMatchResult(p.userId, won);
        p.transport.send({
          type: 'trophy_update',
          trophies: profile.trophies,
          delta,
          arena: profile.arena,
        });
      } catch {
        // DB error — skip silently
      }
    }
  }

  // ---- rematch (only after a match ends) ----
  private requestRematch(playerId: string): void {
    if (this.status !== 'result' || !this.matchOver) return;
    // If the other player already asked, this press means "yes, let's go".
    if (this.rematchBy && this.rematchBy !== playerId) return this.startMatch();
    this.rematchBy = playerId;
    const p = this.players.get(playerId);
    this.sendTo(playerId, { type: 'rematch_waiting' });
    for (const [id, other] of this.players) {
      if (id === playerId) continue;
      other.transport.send({ type: 'rematch_requested', byId: playerId, byName: p?.name ?? '' });
    }
  }

  private respondRematch(playerId: string, accept: boolean): void {
    // Only the player who did NOT initiate can respond.
    if (!this.rematchBy || this.rematchBy === playerId) return;
    if (accept) {
      this.startMatch();
    } else {
      this.sendTo(this.rematchBy, { type: 'rematch_declined' });
      this.rematchBy = null;
    }
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
