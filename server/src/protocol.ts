// WebSocket message protocol shared between the game server and clients.
// JSON messages discriminated by `type`. (The RN app mirrors these types.)

import type { SpellInfo, VerifyReason } from './game/verify.ts';

export interface ClubRef {
  id: number;
  name: string;
  logoUrl: string | null;
}

export type RoomStatus = 'lobby' | 'countdown' | 'pick' | 'reveal' | 'guess' | 'result';

export type Difficulty = 'easy' | 'medium' | 'hard';

// Which clubs are allowed in a game.
export type Scope =
  | { type: 'all' }
  | { type: 'league'; value: string }
  | { type: 'country'; value: string };

export interface GameOptions {
  scope?: Scope;
  difficulty?: Difficulty; // bot difficulty (solo only)
}

export interface ArenaView {
  name: string;
  icon: string;
  minTrophies: number;
}

export interface ProfileView {
  userId: string;
  displayName: string;
  trophies: number;
  diamonds: number;
  wins: number;
  losses: number;
  arena: ArenaView;
}

export interface PlayerView {
  id: string;
  name: string;
  score: number;
  isHost: boolean;
  connected: boolean;
  trophies?: number;
  arena?: ArenaView;
}

export interface RoomView {
  code: string;
  status: RoomStatus;
  players: PlayerView[];
  youId: string;
}

// ---- Client -> Server ----
export type ClientMsg =
  | { type: 'create_room'; name: string; options?: GameOptions }
  | { type: 'create_solo'; name: string; options?: GameOptions }
  | { type: 'join_room'; code: string; name: string }
  | { type: 'register'; name: string; gameCenterId?: string }
  | { type: 'change_name'; newName: string }
  | { type: 'find_match'; name?: string; options?: GameOptions } // ranked matchmaking
  | { type: 'start' }
  | { type: 'pick_team'; clubId: number }
  | { type: 'submit_guess'; text: string }
  | { type: 'play_again' } // request a rematch after the match ends
  | { type: 'rematch_response'; accept: boolean }
  | { type: 'search_clubs'; reqId: string; q: string };

// ---- Server -> Client ----
export interface RoundResult {
  correct: boolean;
  reason: VerifyReason | 'timeout' | 'no_common'; // no_common: no player played for both → round skipped
  autocorrected: boolean;
  answeredById: string | null;
  answeredByName: string | null;
  guess: string;
  teamA: ClubRef;
  teamB: ClubRef;
  matchedPlayerName: string | null;
  matchedPlayerImageUrl: string | null;
  spellsA: SpellInfo[];
  spellsB: SpellInfo[];
  allClubs: SpellInfo[];
  commonPlayers: { name: string; imageUrl: string | null }[];
}

export type ServerMsg =
  | { type: 'room_state'; room: RoomView }
  | { type: 'profile'; profile: ProfileView }
  | { type: 'name_changed'; profile: ProfileView }
  | { type: 'countdown'; n: number }
  | { type: 'pick_phase'; endsAt: number }
  | { type: 'team_picked'; playerId: string }
  | { type: 'reveal_teams'; teamA: ClubRef; teamB: ClubRef }
  | { type: 'guess_phase'; endsAt: number }
  | { type: 'guess_locked'; byId: string; byName: string }
  // matchOver: a player reached `target` wins → the match is over (offer rematch).
  | {
      type: 'result';
      result: RoundResult;
      players: PlayerView[];
      matchOver: boolean;
      winnerId: string | null;
      winnerName: string | null;
      target: number;
    }
  | { type: 'rematch_requested'; byId: string; byName: string } // opponent wants to play again
  | { type: 'rematch_waiting' } // your rematch request was sent, waiting for opponent
  | { type: 'rematch_declined' } // opponent declined your rematch request
  | { type: 'trophy_update'; trophies: number; delta: number; arena: ArenaView }
  | { type: 'club_results'; reqId: string; clubs: ClubRef[] }
  | { type: 'searching' }
  | { type: 'opponent_left' }
  | { type: 'error'; message: string };
