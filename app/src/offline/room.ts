/**
 * OfflineRoom — client-side game state machine for bot matches without a server.
 *
 * Mirrors the server's room.ts state flow:
 *   lobby → countdown → pick → reveal → guess → result
 *
 * Dispatches the same ServerMsg types that useCrossover's reducer understands,
 * so the existing screens work unchanged.
 */
import type { ClubRef, GameMode, RoundResult, ServerMsg, Scope, PlayerView } from '../protocol';
import {
  searchClubs as offlineSearchClubs,
  randomClub,
  verifyGuess,
  commonPlayers,
  hasCommonPlayers,
  normalize,
  type OfflineClub,
} from './db';

type Difficulty = 'easy' | 'medium' | 'hard';
type Dispatch = (msg: ServerMsg) => void;

const COUNTDOWN_FROM = 3;
const PICK_MS = 10_000;
const GUESS_MS = 30_000;
const WIN_TARGET = 3;
const MAX_WRONG = 3;

interface OfflinePlayer {
  id: string;
  name: string;
  score: number;
  wrongCount: number;
  isHost: boolean;
  trophies: number;
  arena: { name: string; icon: string; minTrophies: number };
  avatar?: string | null;
}

export class OfflineRoom {
  private dispatch: Dispatch;
  private difficulty: Difficulty;
  private scope: Scope;
  private gameMode: GameMode;
  private youId: string;
  private botId: string;
  private you: OfflinePlayer;
  private bot: OfflinePlayer;
  private roundNumber = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private round: {
    teamA?: ClubRef;
    teamB?: ClubRef;
    answered: boolean;
    passedBy: Set<string>;
  } | null = null;
  private botAnswer: string | null = null;
  private matchOver = false;

  constructor(opts: {
    dispatch: Dispatch;
    difficulty: Difficulty;
    scope: Scope;
    gameMode: GameMode;
    playerName: string;
    playerTrophies: number;
    playerArena: { name: string; icon: string; minTrophies: number };
    playerAvatar?: string | null;
  }) {
    this.dispatch = opts.dispatch;
    this.difficulty = opts.difficulty;
    this.scope = opts.scope;
    this.gameMode = opts.gameMode;
    this.youId = 'you';
    this.botId = 'bot';
    this.you = {
      id: this.youId, name: opts.playerName, score: 0, wrongCount: 0, isHost: true,
      trophies: opts.playerTrophies, arena: opts.playerArena, avatar: opts.playerAvatar ?? null,
    };
    this.bot = {
      id: this.botId, name: 'Bot', score: 0, wrongCount: 0, isHost: false,
      trophies: 0, arena: { name: 'Bot', icon: '🤖', minTrophies: 0 },
    };
  }

  private clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  private playerViews(): PlayerView[] {
    return [this.you, this.bot].map(p => ({
      id: p.id, name: p.name, score: p.score, wrongCount: p.wrongCount,
      isHost: p.isHost, connected: true, trophies: p.trophies, arena: p.arena, avatar: p.avatar ?? null,
    }));
  }

  private broadcastState() {
    this.dispatch({
      type: 'room_state',
      room: { code: 'OFFLINE', status: 'lobby', players: this.playerViews(), youId: this.youId },
    } as any);
  }

  // ---- Public API (called by useCrossover actions) ----

  start() {
    this.broadcastState();
    this.beginCountdown();
  }

  async handlePick(clubId: number) {
    if (!this.round) return;
    // Player picks, bot auto-picks
    const clubs = await offlineSearchClubs('', 200);
    const club = clubs.find(c => c.id === clubId);
    if (!club) return;
    this.round.teamA = { id: club.id, name: club.name, logoUrl: club.logoUrl };
    // Bot picks
    const botClub = await randomClub(this.difficulty);
    if (botClub) {
      this.round.teamB = { id: botClub.id, name: botClub.name, logoUrl: botClub.logoUrl };
    }
    this.clearTimers();
    this.revealTeams();
  }

  async submitGuess(text: string) {
    if (!this.round || this.round.answered || !this.round.teamA || !this.round.teamB) return;
    this.round.answered = true;
    this.clearTimers();

    this.dispatch({ type: 'guess_locked', byId: this.youId, byName: this.you.name } as any);

    const result = await verifyGuess(this.round.teamA.id, this.round.teamB.id, text);

    if (result.correct) {
      this.you.score++;
      this.finishRound({
        correct: true,
        reason: 'both',
        autocorrected: result.autocorrected,
        answeredById: this.youId,
        answeredByName: this.you.name,
        guess: text,
        teamA: this.round.teamA,
        teamB: this.round.teamB,
        matchedPlayerName: result.matchedPlayerName,
        matchedPlayerImageUrl: result.matchedPlayerImageUrl,
        spellsA: result.spellsA,
        spellsB: result.spellsB,
        allClubs: result.allClubs,
        commonPlayers: [],
      });
    } else {
      this.you.wrongCount++;
      if (this.you.wrongCount >= MAX_WRONG) {
        this.bot.score = WIN_TARGET;
      }
      const common = await commonPlayers(this.round.teamA.id, this.round.teamB.id, 5);
      this.finishRound({
        correct: false,
        reason: 'not_both',
        autocorrected: false,
        answeredById: this.youId,
        answeredByName: this.you.name,
        guess: text,
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
  }

  pass() {
    if (!this.round || this.round.answered) return;
    this.round.passedBy.add(this.youId);
    this.dispatch({ type: 'pass_locked', byId: this.youId, byName: this.you.name } as any);
    // Bot also passes with some probability based on difficulty
    const passChance = this.difficulty === 'easy' ? 0.8 : this.difficulty === 'medium' ? 0.5 : 0.25;
    if (Math.random() < passChance) {
      this.round.passedBy.add(this.botId);
      this.dispatch({ type: 'pass_locked', byId: this.botId, byName: 'Bot' } as any);
      void this.skipPassed();
    }
  }

  ready() {
    // In offline mode, immediately begin next round
    this.clearTimers();
    this.beginCountdown();
  }

  async searchClubs(q: string) {
    const clubs = await offlineSearchClubs(q, 60);
    this.dispatch({
      type: 'club_results',
      reqId: 'q',
      clubs: clubs.map(c => ({ id: c.id, name: c.name, logoUrl: c.logoUrl })),
    } as any);
  }

  leave() {
    this.clearTimers();
  }

  // ---- Game flow (private) ----

  private beginCountdown() {
    let n = COUNTDOWN_FROM;
    const tick = () => {
      this.dispatch({ type: 'countdown', n } as any);
      if (n > 0) {
        n--;
        this.timers.push(setTimeout(tick, 1000));
      } else {
        this.timers.push(setTimeout(() => this.beginPick(), 500));
      }
    };
    tick();
  }

  private beginPick() {
    this.round = { answered: false, passedBy: new Set() };
    this.botAnswer = null;
    const endsAt = Date.now() + PICK_MS;
    this.dispatch({ type: 'pick_phase', endsAt, pickRole: 'team' } as any);

    // Auto-pick timeout
    this.timers.push(setTimeout(() => {
      if (this.round && !this.round.teamA) {
        void this.autoPickAndReveal();
      }
    }, PICK_MS));
  }

  private async autoPickAndReveal() {
    if (!this.round) return;
    const club = await randomClub(this.difficulty);
    if (club) {
      this.round.teamA = { id: club.id, name: club.name, logoUrl: club.logoUrl };
    }
    const botClub = await randomClub(this.difficulty);
    if (botClub) {
      this.round.teamB = { id: botClub.id, name: botClub.name, logoUrl: botClub.logoUrl };
    }
    this.revealTeams();
  }

  private async revealTeams() {
    if (!this.round?.teamA || !this.round?.teamB) return;

    this.dispatch({
      type: 'reveal_teams',
      teamA: this.round.teamA,
      teamB: this.round.teamB,
      mode: this.gameMode,
    } as any);

    // Check if there are common players
    const hasCommon = await hasCommonPlayers(this.round.teamA.id, this.round.teamB.id);
    if (!hasCommon) {
      this.timers.push(setTimeout(() => {
        if (!this.round?.teamA || !this.round?.teamB) return;
        this.finishRound({
          correct: false, reason: 'no_common', autocorrected: false,
          answeredById: null, answeredByName: null, guess: '',
          teamA: this.round.teamA, teamB: this.round.teamB,
          matchedPlayerName: null, matchedPlayerImageUrl: null,
          spellsA: [], spellsB: [], allClubs: [], commonPlayers: [],
        });
      }, 2200));
      return;
    }

    // Same team check
    if (this.round.teamA.id === this.round.teamB.id) {
      this.timers.push(setTimeout(() => {
        if (!this.round?.teamA || !this.round?.teamB) return;
        this.finishRound({
          correct: false, reason: 'same_team', autocorrected: false,
          answeredById: null, answeredByName: null, guess: '',
          teamA: this.round.teamA, teamB: this.round.teamB,
          matchedPlayerName: null, matchedPlayerImageUrl: null,
          spellsA: [], spellsB: [], allClubs: [], commonPlayers: [],
        });
      }, 2200));
      return;
    }

    // Prepare bot answer
    const common = await commonPlayers(this.round.teamA.id, this.round.teamB.id, 6);
    if (common.length > 0) {
      this.botAnswer = common[Math.floor(Math.random() * common.length)]!.name;
    }

    // Begin guess phase after reveal delay
    this.timers.push(setTimeout(() => this.beginGuess(), 2200));
  }

  private beginGuess() {
    const endsAt = Date.now() + GUESS_MS;
    this.dispatch({ type: 'guess_phase', endsAt } as any);

    // Bot submits after a delay
    if (this.botAnswer) {
      const delay = this.difficulty === 'easy'
        ? 9000 + Math.random() * 7000
        : this.difficulty === 'medium'
        ? 4000 + Math.random() * 5000
        : 1500 + Math.random() * 2500;
      this.timers.push(setTimeout(() => this.botSubmitGuess(), delay));
    }

    // Timeout
    this.timers.push(setTimeout(() => this.onGuessTimeout(), GUESS_MS));
  }

  private async botSubmitGuess() {
    if (!this.round || this.round.answered || !this.botAnswer || !this.round.teamA || !this.round.teamB) return;
    this.round.answered = true;
    this.clearTimers();

    this.dispatch({ type: 'guess_locked', byId: this.botId, byName: 'Bot' } as any);

    this.bot.score++;
    const result = await verifyGuess(this.round.teamA.id, this.round.teamB.id, this.botAnswer);
    const common = await commonPlayers(this.round.teamA.id, this.round.teamB.id, 5);

    this.finishRound({
      correct: true,
      reason: 'both',
      autocorrected: false,
      answeredById: this.botId,
      answeredByName: 'Bot',
      guess: this.botAnswer,
      teamA: this.round.teamA,
      teamB: this.round.teamB,
      matchedPlayerName: result.matchedPlayerName ?? this.botAnswer,
      matchedPlayerImageUrl: result.matchedPlayerImageUrl,
      spellsA: result.spellsA,
      spellsB: result.spellsB,
      allClubs: result.allClubs,
      commonPlayers: common,
    });
  }

  private async onGuessTimeout() {
    if (!this.round || this.round.answered || !this.round.teamA || !this.round.teamB) return;
    const common = await commonPlayers(this.round.teamA.id, this.round.teamB.id, 5);
    this.finishRound({
      correct: false, reason: 'timeout', autocorrected: false,
      answeredById: null, answeredByName: null, guess: '',
      teamA: this.round.teamA, teamB: this.round.teamB,
      matchedPlayerName: null, matchedPlayerImageUrl: null,
      spellsA: [], spellsB: [], allClubs: [], commonPlayers: common,
    });
  }

  private async skipPassed() {
    if (!this.round?.teamA || !this.round?.teamB) return;
    this.clearTimers();
    const common = await commonPlayers(this.round.teamA.id, this.round.teamB.id, 5);
    this.finishRound({
      correct: false, reason: 'passed', autocorrected: false,
      answeredById: null, answeredByName: null, guess: '',
      teamA: this.round.teamA, teamB: this.round.teamB,
      matchedPlayerName: null, matchedPlayerImageUrl: null,
      spellsA: [], spellsB: [], allClubs: [], commonPlayers: common,
    });
  }

  private finishRound(result: RoundResult) {
    this.clearTimers();
    this.roundNumber++;

    const winner = [this.you, this.bot].find(p => p.score >= WIN_TARGET) ?? null;
    this.matchOver = Boolean(winner);

    this.dispatch({
      type: 'result',
      result,
      players: this.playerViews(),
      matchOver: this.matchOver,
      winnerId: winner?.id ?? null,
      winnerName: winner?.name ?? null,
      target: WIN_TARGET,
    } as any);

    if (!this.matchOver) {
      this.dispatch({ type: 'waiting_ready' } as any);
      // Auto-advance after 20 seconds if player doesn't press ready
      this.timers.push(setTimeout(() => {
        if (!this.matchOver) this.beginCountdown();
      }, 20_000));
    }
  }
}
