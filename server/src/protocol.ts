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

// Game mode: determines what each player picks and how the guess is verified.
export type GameMode = 'team-team' | 'country-team' | 'letter-team';

// What a player should pick during the pick phase.
export type PickRole = 'team' | 'country' | 'letter';

// Which clubs are allowed in a game.
export type Scope =
  | { type: 'all' }
  | { type: 'league'; value: string }
  | { type: 'country'; value: string };

export interface GameOptions {
  scope?: Scope;
  difficulty?: Difficulty; // bot difficulty (solo only)
  mode?: GameMode;         // game mode (default: 'team-team')
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
  ownedEmotes: string[];
  equippedEmotes: string[];
  usernameSet: boolean;
  socialPackUntil: string | null; // ISO date or null
  arena: ArenaView;
}

export interface PlayerView {
  id: string;
  name: string;
  score: number;
  wrongCount: number;
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
  | { type: 'create_room'; name: string; userId?: string; options?: GameOptions }
  | { type: 'create_solo'; name: string; userId?: string; options?: GameOptions }
  | { type: 'join_room'; code: string; name: string; userId?: string }
  | { type: 'register'; name: string; gameCenterId?: string; userId?: string }
  | { type: 'auth'; provider: 'apple' | 'google' | 'facebook'; token: string; name?: string }
  | { type: 'change_name'; newName: string }
  | { type: 'set_username'; username: string; userId?: string } // one-time unique username after sign-in
  | { type: 'find_match'; name?: string; userId?: string; options?: GameOptions } // ranked matchmaking
  | { type: 'start' }
  | { type: 'pick_team'; clubId: number }
  | { type: 'pick_country'; country: string }  // country-team mode: pick a nationality
  | { type: 'pick_letter'; letter: string }     // letter-team mode: pick a letter (A-Z)
  | { type: 'submit_guess'; text: string }
  | { type: 'pass' } // skip this round; if both players pass, the round is voided (no points)
  | { type: 'ready' } // ready for next round
  | { type: 'play_again' } // request a rematch after the match ends
  | { type: 'rematch_response'; accept: boolean }
  | { type: 'send_emote'; emoteId: string } // show an emote to the opponent during a match
  | { type: 'buy_emote'; emoteId: string } // purchase a premium emote with diamonds
  | { type: 'equip_emotes'; emoteIds: string[] } // set the match loadout (max 3 visual)
  | { type: 'search_clubs'; reqId: string; q: string }
  // ---- Friends ----
  | { type: 'send_friend_request'; targetCode?: string; targetUsername?: string }
  | { type: 'respond_friend_request'; requestId: string; accept: boolean }
  | { type: 'list_friends' }
  | { type: 'search_users'; query: string }
  | { type: 'remove_friend'; friendId: string }
  | { type: 'invite_friend_match'; friendId: string; options?: GameOptions }
  | { type: 'list_match_history' };

// ---- Server -> Client ----
export interface RoundResult {
  correct: boolean;
  reason: VerifyReason | 'timeout' | 'no_common' | 'same_team' | 'passed';
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
  | { type: 'pick_phase'; endsAt: number; pickRole?: PickRole }
  | { type: 'team_picked'; playerId: string }
  | { type: 'reveal_teams'; teamA: ClubRef; teamB: ClubRef; mode?: GameMode; country?: string; letter?: string }
  | { type: 'guess_phase'; endsAt: number }
  | { type: 'guess_locked'; byId: string; byName: string }
  | { type: 'pass_locked'; byId: string; byName: string } // a player chose to pass this round
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
  | { type: 'waiting_ready' } // waiting for players to press ready
  | { type: 'ready_countdown'; endsAt: number } // forced countdown started
  | { type: 'player_ready'; playerId: string } // a player pressed ready
  | { type: 'rematch_requested'; byId: string; byName: string } // opponent wants to play again
  | { type: 'rematch_waiting' } // your rematch request was sent, waiting for opponent
  | { type: 'rematch_declined' } // opponent declined your rematch request
  | { type: 'trophy_update'; trophies: number; delta: number; arena: ArenaView }
  | { type: 'emote'; fromId: string; emoteId: string } // a player in the room sent an emote
  | { type: 'emote_purchased'; profile: ProfileView; emoteId: string } // store purchase succeeded
  | { type: 'club_results'; reqId: string; clubs: ClubRef[] }
  | { type: 'searching' }
  | { type: 'opponent_left' }
  // ---- Friends ----
  | { type: 'friend_request_received'; requestId: string; fromId: string; fromName: string }
  | { type: 'friend_request_sent' }
  | { type: 'friend_request_responded'; requestId: string; accepted: boolean }
  | { type: 'friends_list'; friends: FriendView[]; requests: FriendRequestView[] }
  | { type: 'user_search_results'; users: { userId: string; displayName: string }[] }
  | { type: 'friend_removed'; friendId: string }
  | { type: 'match_invite_received'; fromId: string; fromName: string; options?: GameOptions }
  | { type: 'match_history_list'; matches: MatchHistoryView[] }
  | { type: 'error'; message: string };

export interface MatchHistoryView {
  id: string;
  playerName: string;
  opponentName: string;
  playerScore: number;
  opponentScore: number;
  won: boolean;
  playerTrophies: number;
  opponentTrophies: number;
  gameMode: string;
  rounds: {
    teamA: string; teamALogo: string | null;
    teamB: string; teamBLogo: string | null;
    player: string; playerImageUrl: string | null;
    answeredBy: string;
  }[];
  playedAt: string;
}

export interface FriendView {
  userId: string;
  displayName: string;
  trophies: number;
  arena: ArenaView;
  online: boolean;
}

export interface FriendRequestView {
  requestId: string;
  fromId: string;
  fromName: string;
  createdAt: string;
}
