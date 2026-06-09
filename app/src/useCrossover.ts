import { useCallback, useEffect, useReducer, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SERVER_URL, HTTP_URL } from './config';
import { t } from './i18n';
import type {
  ArenaView,
  ClientMsg,
  ClubRef,
  GameOptions,
  ProfileView,
  RoomView,
  RoundResult,
  ScopesList,
  ServerMsg,
} from './protocol';

export type Phase = 'home' | 'arenas' | 'leaderboard' | 'searching' | 'lobby' | 'countdown' | 'pick' | 'reveal' | 'guess' | 'result';

export interface LeaderboardEntry {
  rank: number;
  displayName: string;
  trophies: number;
  wins: number;
  losses: number;
  arena: { name: string; icon: string; minTrophies: number };
}

export interface GameState {
  connected: boolean;
  phase: Phase;
  room: RoomView | null;
  error: string | null;
  countdown: number | null;
  teams: { teamA: ClubRef; teamB: ClubRef } | null;
  picked: boolean;
  pickEndsAt: number | null;
  guessEndsAt: number | null;
  locked: { byId: string; byName: string } | null;
  result: RoundResult | null;
  clubResults: ClubRef[];
  scopes: ScopesList | null;
  profile: ProfileView | null;
  trophyDelta: { trophies: number; delta: number; arena: ArenaView } | null;
  leaderboard: LeaderboardEntry[];
  // match (first to `winTarget` round wins) + rematch flow
  matchOver: boolean;
  matchWinnerId: string | null;
  matchWinnerName: string | null;
  winTarget: number;
  rematchState: 'idle' | 'waiting' | 'incoming' | 'declined';
  rematchByName: string | null;
  waitingReady: boolean;
  readyCountdownEndsAt: number | null;
  iReady: boolean;
  // emotes currently shown over the match, keyed by the player who sent them.
  // `n` increases on every emote so the UI can re-trigger the same one.
  emotes: Record<string, { emoteId: string; n: number }>;
  emoteSeq: number;
}

const initialState: GameState = {
  connected: false,
  phase: 'home',
  room: null,
  error: null,
  countdown: null,
  teams: null,
  picked: false,
  pickEndsAt: null,
  guessEndsAt: null,
  locked: null,
  result: null,
  clubResults: [],
  scopes: null,
  profile: null,
  trophyDelta: null,
  leaderboard: [],
  matchOver: false,
  matchWinnerId: null,
  matchWinnerName: null,
  winTarget: 3,
  rematchState: 'idle',
  rematchByName: null,
  waitingReady: false,
  readyCountdownEndsAt: null,
  iReady: false,
  emotes: {},
  emoteSeq: 0,
};

const PROFILE_KEY = '@crossover_profile';

type Action =
  | ServerMsg
  | { type: '_connected'; value: boolean }
  | { type: '_reset' }
  | { type: '_picked' }
  | { type: '_scopes'; scopes: ScopesList }
  | { type: '_leaderboard'; entries: LeaderboardEntry[] }
  | { type: '_phase'; phase: Phase }
  | { type: '_load_profile'; profile: ProfileView }
  | { type: '_ready' };

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case '_connected':
      return { ...state, connected: action.value };
    case '_reset':
      return { ...initialState, scopes: state.scopes, profile: state.profile };
    case '_picked':
      return { ...state, picked: true };
    case '_scopes':
      return { ...state, scopes: action.scopes };
    case '_leaderboard':
      return { ...state, leaderboard: action.entries, phase: 'leaderboard' };
    case '_phase':
      return { ...state, phase: action.phase };
    case '_load_profile':
      return { ...state, profile: action.profile };
    case '_ready':
      return { ...state, iReady: true };

    case 'searching':
      return { ...state, phase: 'searching' };
    case 'profile':
      return { ...state, profile: action.profile };
    case 'name_changed':
      return { ...state, profile: action.profile };
    case 'trophy_update':
      return {
        ...state,
        trophyDelta: { trophies: action.trophies, delta: action.delta, arena: action.arena },
        profile: state.profile
          ? { ...state.profile, trophies: action.trophies, arena: action.arena }
          : state.profile,
      };
    case 'emote': {
      const n = state.emoteSeq + 1;
      return { ...state, emoteSeq: n, emotes: { ...state.emotes, [action.fromId]: { emoteId: action.emoteId, n } } };
    }
    case 'emote_purchased':
      return { ...state, profile: action.profile };

    case 'room_state':
      return {
        ...state,
        room: action.room,
        phase: state.phase === 'home' ? 'lobby' : state.phase,
        error: state.phase === 'home' ? null : state.error,
      };
    case 'countdown':
      return {
        ...state,
        phase: 'countdown',
        countdown: action.n,
        result: null,
        teams: null,
        locked: null,
        trophyDelta: null,
        matchOver: false,
        matchWinnerId: null,
        matchWinnerName: null,
        rematchState: 'idle',
        rematchByName: null,
        waitingReady: false,
        readyCountdownEndsAt: null,
        iReady: false,
      };
    case 'pick_phase':
      return { ...state, phase: 'pick', picked: false, pickEndsAt: action.endsAt, teams: null, locked: null, result: null, clubResults: [] };
    case 'reveal_teams':
      return { ...state, phase: 'reveal', teams: { teamA: action.teamA, teamB: action.teamB } };
    case 'guess_phase':
      return { ...state, phase: 'guess', guessEndsAt: action.endsAt };
    case 'guess_locked':
      return { ...state, locked: { byId: action.byId, byName: action.byName } };
    case 'result':
      return {
        ...state,
        phase: 'result',
        result: action.result,
        room: state.room ? { ...state.room, players: action.players } : state.room,
        matchOver: action.matchOver,
        matchWinnerId: action.winnerId,
        matchWinnerName: action.winnerName,
        winTarget: action.target,
        rematchState: 'idle',
        rematchByName: null,
      };
    case 'waiting_ready':
      return { ...state, waitingReady: true, readyCountdownEndsAt: null, iReady: false };
    case 'ready_countdown':
      return { ...state, readyCountdownEndsAt: action.endsAt };
    case 'player_ready':
      return state;
    case 'rematch_waiting':
      return { ...state, rematchState: 'waiting' };
    case 'rematch_requested':
      return { ...state, rematchState: 'incoming', rematchByName: action.byName };
    case 'rematch_declined':
      return { ...state, rematchState: 'declined' };
    case 'club_results':
      return { ...state, clubResults: action.clubs };
    case 'opponent_left':
      return { ...state, phase: 'lobby', error: t('error.opponentLeft'), teams: null, result: null, locked: null };
    case 'error':
      return { ...state, error: action.message };
    default:
      return state;
  }
}

// Persist profile to AsyncStorage whenever it changes.
function saveProfile(profile: ProfileView): void {
  AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile)).catch(() => {});
}

export function useCrossover() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const wsRef = useRef<WebSocket | null>(null);

  // On mount: load saved profile from AsyncStorage.
  useEffect(() => {
    AsyncStorage.getItem(PROFILE_KEY)
      .then((raw) => {
        if (raw) {
          const profile = JSON.parse(raw) as ProfileView;
          dispatch({ type: '_load_profile', profile });
        }
      })
      .catch(() => {});
  }, []);

  // Persist profile whenever it changes from server messages.
  const prevProfile = useRef<ProfileView | null>(null);
  useEffect(() => {
    if (state.profile && state.profile !== prevProfile.current) {
      prevProfile.current = state.profile;
      saveProfile(state.profile);
    }
  }, [state.profile]);

  const connectAndSend = useCallback((first: ClientMsg) => {
    wsRef.current?.close();
    const ws = new WebSocket(SERVER_URL);
    wsRef.current = ws;
    ws.onopen = () => {
      dispatch({ type: '_connected', value: true });
      ws.send(JSON.stringify(first));
    };
    ws.onmessage = (e) => {
      try {
        dispatch(JSON.parse(String(e.data)) as ServerMsg);
      } catch {
        /* ignore malformed */
      }
    };
    ws.onclose = () => {
      dispatch({ type: '_connected', value: false });
    };
    ws.onerror = () => dispatch({ type: 'error', message: t('error.connect') });
  }, []);

  const send = useCallback((msg: ClientMsg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else {
      // Connection lost — reset to home so user can start fresh
      dispatch({ type: 'error', message: t('error.disconnected') });
      dispatch({ type: '_reset' });
    }
  }, []);

  // Load available leagues/countries once for the scope picker.
  useEffect(() => {
    let alive = true;
    fetch(`${HTTP_URL}/scopes`)
      .then((r) => r.json())
      .then((s: ScopesList) => {
        if (alive) dispatch({ type: '_scopes', scopes: s });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const actions = {
    openLeaderboard: () => {
      fetch(`${HTTP_URL}/leaderboard`)
        .then((r) => r.json())
        .then((entries: LeaderboardEntry[]) => dispatch({ type: '_leaderboard', entries }))
        .catch(() => {});
    },
    closeLeaderboard: () => dispatch({ type: '_phase', phase: 'home' }),
    openArenas: () => dispatch({ type: '_phase', phase: 'arenas' }),
    closeArenas: () => dispatch({ type: '_phase', phase: 'home' }),
    register: (name: string, gameCenterId?: string) => {
      const userId = state.profile?.userId;
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        send({ type: 'register', name, gameCenterId, userId });
      } else {
        connectAndSend({ type: 'register', name, gameCenterId, userId });
      }
    },
    // Sign in with Apple / Google / Facebook: send the provider's identity token
    // to the server, which verifies it and returns the account profile.
    authWith: (provider: 'apple' | 'google' | 'facebook', token: string, name?: string) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        send({ type: 'auth', provider, token, name });
      } else {
        connectAndSend({ type: 'auth', provider, token, name });
      }
    },
    changeName: (newName: string) => send({ type: 'change_name', newName }),
    findMatch: (options?: GameOptions) =>
      // Carry the registered name + account id: this fresh socket hasn't sent
      // `register`, so without them the player would be a nameless "Oyuncu" with
      // no trophies awarded.
      connectAndSend({ type: 'find_match', name: state.profile?.displayName, userId: state.profile?.userId, options }),
    cancelSearch: () => {
      wsRef.current?.close();
      wsRef.current = null;
      dispatch({ type: '_reset' });
    },
    createRoom: (name: string, options?: GameOptions) =>
      connectAndSend({ type: 'create_room', name, userId: state.profile?.userId, options }),
    createSolo: (name: string, options?: GameOptions) =>
      connectAndSend({ type: 'create_solo', name, userId: state.profile?.userId, options }),
    joinRoom: (code: string, name: string) =>
      connectAndSend({ type: 'join_room', code: code.toUpperCase(), name, userId: state.profile?.userId }),
    start: () => send({ type: 'start' }),
    pickTeam: (clubId: number) => {
      send({ type: 'pick_team', clubId });
      dispatch({ type: '_picked' });
    },
    searchClubs: (q: string) => send({ type: 'search_clubs', reqId: 'q', q }),
    submitGuess: (text: string) => send({ type: 'submit_guess', text }),
    ready: () => {
      send({ type: 'ready' });
      dispatch({ type: '_ready' as any });
    },
    playAgain: () => send({ type: 'play_again' }),
    acceptRematch: () => send({ type: 'rematch_response', accept: true }),
    declineRematch: () => send({ type: 'rematch_response', accept: false }),
    sendEmote: (emoteId: string) => send({ type: 'send_emote', emoteId }),
    buyEmote: (emoteId: string) => send({ type: 'buy_emote', emoteId }),
    leave: () => {
      wsRef.current?.close();
      wsRef.current = null;
      dispatch({ type: '_reset' });
    },
  };

  return { state, actions };
}
