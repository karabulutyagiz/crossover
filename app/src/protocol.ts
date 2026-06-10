// Client mirror of the server's WebSocket protocol (server/src/protocol.ts).
// Keep these in sync. (Phase 1: duplicated; later we can extract a shared pkg.)

export interface ClubRef {
  id: number;
  name: string;
  logoUrl: string | null;
}

export interface SpellInfo {
  clubId: number;
  clubName: string;
  logoUrl: string | null;
  startYear: number | null;
  endYear: number | null;
}

export type VerifyReason = 'both' | 'not_both' | 'no_match' | 'timeout' | 'no_common' | 'same_team';

export type RoomStatus = 'lobby' | 'countdown' | 'pick' | 'reveal' | 'guess' | 'result';

export type Difficulty = 'easy' | 'medium' | 'hard';

export type GameMode = 'team-team' | 'country-team' | 'letter-team';

export type PickRole = 'team' | 'country' | 'letter';

export type Scope =
  | { type: 'all' }
  | { type: 'league'; value: string }
  | { type: 'country'; value: string };

export interface GameOptions {
  scope?: Scope;
  difficulty?: Difficulty;
  mode?: GameMode;
}

export interface ScopeOption {
  value: string;
  displayName?: string;
  count: number;
  logoUrl?: string | null;
}
export interface ScopesList {
  leagues: ScopeOption[];
  countries: ScopeOption[];
  nationalities?: { value: string; count: number }[];
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
  usernameSet: boolean;
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

export interface RoundResult {
  correct: boolean;
  reason: VerifyReason;
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

export type ClientMsg =
  | { type: 'create_room'; name: string; userId?: string; options?: GameOptions }
  | { type: 'create_solo'; name: string; userId?: string; options?: GameOptions }
  | { type: 'join_room'; code: string; name: string; userId?: string }
  | { type: 'register'; name: string; gameCenterId?: string; userId?: string }
  | { type: 'auth'; provider: 'apple' | 'google' | 'facebook'; token: string; name?: string }
  | { type: 'change_name'; newName: string }
  | { type: 'set_username'; username: string }
  | { type: 'find_match'; name?: string; userId?: string; options?: GameOptions }
  | { type: 'start' }
  | { type: 'pick_team'; clubId: number }
  | { type: 'pick_country'; country: string }
  | { type: 'pick_letter'; letter: string }
  | { type: 'submit_guess'; text: string }
  | { type: 'ready' }
  | { type: 'play_again' }
  | { type: 'rematch_response'; accept: boolean }
  | { type: 'send_emote'; emoteId: string }
  | { type: 'buy_emote'; emoteId: string }
  | { type: 'search_clubs'; reqId: string; q: string };

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
  | {
      type: 'result';
      result: RoundResult;
      players: PlayerView[];
      matchOver: boolean;
      winnerId: string | null;
      winnerName: string | null;
      target: number;
    }
  | { type: 'waiting_ready' }
  | { type: 'ready_countdown'; endsAt: number }
  | { type: 'player_ready'; playerId: string }
  | { type: 'rematch_requested'; byId: string; byName: string }
  | { type: 'rematch_waiting' }
  | { type: 'rematch_declined' }
  | { type: 'trophy_update'; trophies: number; delta: number; arena: ArenaView }
  | { type: 'emote'; fromId: string; emoteId: string }
  | { type: 'emote_purchased'; profile: ProfileView; emoteId: string }
  | { type: 'club_results'; reqId: string; clubs: ClubRef[] }
  | { type: 'searching' }
  | { type: 'opponent_left' }
  | { type: 'error'; message: string };
