import { useCallback, useEffect, useReducer, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { SERVER_URL, HTTP_URL } from './config';
import { t } from './i18n';
import { OfflineRoom } from './offline/room';
import { initOfflineDB } from './offline/db';
import type {
  ArenaView,
  ClientMsg,
  ClubRef,
  FriendRequestView,
  FriendView,
  GameMode,
  GameOptions,
  MatchHistoryView,
  PickRole,
  ProfileView,
  PublicProfile,
  RoomView,
  RoundResult,
  ScopesList,
  ServerMsg,
} from './protocol';

export type Phase = 'home' | 'arenas' | 'leaderboard' | 'matchHistory' | 'profile' | 'searching' | 'matchup' | 'lobby' | 'countdown' | 'pick' | 'reveal' | 'guess' | 'result';

export interface LeaderboardEntry {
  rank: number;
  displayName: string;
  trophies: number;
  wins: number;
  losses: number;
  arena: { name: string; icon: string; minTrophies: number };
}

export type FriendInfo = FriendView;

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
  passedBy: string[]; // player ids who passed this round
  result: RoundResult | null;
  clubResults: ClubRef[];
  scopes: ScopesList | null;
  profile: ProfileView | null;
  trophyDelta: { trophies: number; delta: number; arena: ArenaView } | null;
  leaderboard: LeaderboardEntry[];
  friends: FriendInfo[];
  friendRequests: FriendRequestView[];
  userSearchResults: { userId: string; displayName: string }[];
  matchInvite: { fromId: string; fromName: string; options?: GameOptions } | null;
  // An invite I sent that's awaiting the friend's answer (30s window).
  outgoingInvite: { toId: string; toName: string; expiresAt: number } | null;
  // A friend's public profile I'm currently viewing.
  viewProfile: PublicProfile | null;
  // Transient success notice (e.g. "friend request sent"), shown green then cleared.
  notice: string | null;
  matchHistory: MatchHistoryView[];
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
  // Game mode & pick role for the current round
  pickRole: PickRole | null;
  revealMode: GameMode | null;
  revealCountry: string | null;
  revealLetter: string | null;
  // emotes currently shown over the match, keyed by the player who sent them.
  // `n` increases on every emote so the UI can re-trigger the same one.
  emotes: Record<string, { emoteId: string; n: number }>;
  emoteSeq: number;
  isQuickMatch: boolean;
  opponentForfeit: boolean;
  lastGameOptions: GameOptions | null;
}

export const initialState: GameState = {
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
  passedBy: [],
  result: null,
  clubResults: [],
  scopes: null,
  profile: null,
  trophyDelta: null,
  leaderboard: [],
  friends: [],
  friendRequests: [],
  userSearchResults: [],
  matchInvite: null,
  outgoingInvite: null,
  viewProfile: null,
  notice: null,
  matchHistory: [],
  matchOver: false,
  matchWinnerId: null,
  matchWinnerName: null,
  winTarget: 3,
  rematchState: 'idle',
  rematchByName: null,
  waitingReady: false,
  readyCountdownEndsAt: null,
  iReady: false,
  pickRole: null,
  revealMode: null,
  revealCountry: null,
  revealLetter: null,
  emotes: {},
  emoteSeq: 0,
  isQuickMatch: false,
  opponentForfeit: false,
  lastGameOptions: null,
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
  | { type: '_friends'; friends: FriendInfo[] }
  | { type: '_set_outgoing'; invite: GameState['outgoingInvite'] }
  | { type: '_close_profile' }
  | { type: '_dismiss_invite' }
  | { type: '_clear_notice' }
  | { type: '_ready' }
  | { type: '_set_game_options'; options: GameOptions | null };

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case '_connected':
      // A fresh (re)connect clears any lingering "couldn't connect" error.
      return { ...state, connected: action.value, error: action.value ? null : state.error };
    case '_reset':
      return { ...initialState, scopes: state.scopes, profile: state.profile, friends: state.friends, isQuickMatch: false, opponentForfeit: false };
    case '_picked':
      return { ...state, picked: true };
    case '_scopes':
      return { ...state, scopes: action.scopes };
    case '_leaderboard':
      // Data only — the leaderboard now shows as a centered popup, not a fullscreen phase.
      return { ...state, leaderboard: action.entries };
    case '_phase':
      return { ...state, phase: action.phase };
    case '_load_profile':
      return { ...state, profile: action.profile };
    case '_friends':
      return { ...state, friends: action.friends };
    case '_ready':
      return { ...state, iReady: true };
    case '_set_game_options':
      return { ...state, lastGameOptions: (action as any).options };

    case 'friends_list':
      return { ...state, friends: (action as any).friends ?? [], friendRequests: (action as any).requests ?? [] };
    case 'friend_request_received':
      return { ...state, friendRequests: [
        { requestId: (action as any).requestId, fromId: (action as any).fromId, fromName: (action as any).fromName, createdAt: new Date().toISOString() },
        ...state.friendRequests,
      ]};
    case 'friend_request_sent':
      return { ...state, notice: 'Arkadaşlık isteği gönderildi' };
    case 'friend_request_responded':
      return { ...state, friendRequests: state.friendRequests.filter((r) => r.requestId !== (action as any).requestId) };
    case 'user_search_results':
      return { ...state, userSearchResults: (action as any).users ?? [] };
    case 'friend_removed':
      return { ...state, friends: state.friends.filter((f) => f.userId !== (action as any).friendId) };
    case 'match_invite_received':
      return { ...state, matchInvite: { fromId: (action as any).fromId, fromName: (action as any).fromName, options: (action as any).options } };
    case 'match_invite_declined':
      return { ...state, outgoingInvite: null, error: t('friends.inviteDeclined') };
    case 'match_invite_cancelled':
      return { ...state, matchInvite: null };
    case 'user_profile':
      return { ...state, viewProfile: (action as any).profile };
    case 'match_history_list':
      return { ...state, matchHistory: (action as any).matches ?? [] };
    case '_dismiss_invite' as any:
      return { ...state, matchInvite: null };
    case '_set_outgoing' as any:
      return { ...state, outgoingInvite: (action as any).invite };
    case '_close_profile' as any:
      return { ...state, viewProfile: null };
    case '_clear_notice' as any:
      return { ...state, notice: null };

    case 'searching':
      return { ...state, phase: 'searching', isQuickMatch: true, opponentForfeit: false };
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

    case 'room_state': {
      // When a non-bot room fills to 2 players, show the matchup reveal screen.
      // This covers: quick match (both sides), friend invite (both sides).
      const roomFull = action.room.players.length === 2;
      const hasBot = action.room.players.some((p) => p.name === 'Bot');
      const preGame = state.phase === 'searching' || state.phase === 'lobby' || state.phase === 'home';
      let nextPhase = state.phase === 'home' ? 'lobby' as Phase : state.phase;
      if (roomFull && !hasBot && preGame) {
        nextPhase = 'matchup';
      }
      return {
        ...state,
        room: action.room,
        phase: nextPhase,
        error: state.phase === 'home' ? null : state.error,
        // A friend match just began — clear any lingering invite UI on both sides.
        outgoingInvite: null,
        matchInvite: null,
      };
    }
    case 'countdown':
      return {
        ...state,
        phase: 'countdown',
        countdown: action.n,
        result: null,
        teams: null,
        locked: null,
        passedBy: [],
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
      return { ...state, phase: 'pick', picked: false, pickEndsAt: action.endsAt, pickRole: (action as any).pickRole ?? 'team', teams: null, locked: null, passedBy: [], result: null, clubResults: [] };
    case 'reveal_teams':
      return {
        ...state,
        phase: 'reveal',
        teams: { teamA: action.teamA, teamB: action.teamB },
        revealMode: (action as any).mode ?? 'team-team',
        revealCountry: (action as any).country ?? null,
        revealLetter: (action as any).letter ?? null,
      };
    case 'guess_phase':
      return { ...state, phase: 'guess', guessEndsAt: action.endsAt };
    case 'guess_locked':
      return { ...state, locked: { byId: action.byId, byName: action.byName } };
    case 'pass_locked':
      return { ...state, passedBy: state.passedBy.includes(action.byId) ? state.passedBy : [...state.passedBy, action.byId] };
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
      if (action.forfeit) {
        return { ...state, opponentForfeit: true };
      }
      return { ...state, phase: 'lobby', error: t('error.opponentLeft'), teams: null, result: null, locked: null };
    case 'error':
      // Internal protocol noise (sent when a stray message reaches the server with no
      // active room) — never surface it to the user.
      if (action.message === 'Create or join a room first') return state;
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
  const offlineRoomRef = useRef<OfflineRoom | null>(null);

  // Initialize offline DB on mount (runs in background, non-blocking)
  useEffect(() => { initOfflineDB().catch(() => {}); }, []);

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

  const connectAndSend = useCallback((first: ClientMsg, opts?: { silent?: boolean }) => {
    wsRef.current?.close();
    const ws = new WebSocket(SERVER_URL);
    wsRef.current = ws;
    ws.onopen = () => {
      dispatch({ type: '_connected', value: true });
      ws.send(JSON.stringify(first));
    };
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(String(e.data)) as ServerMsg;
        dispatch(m);
        // A friend request just arrived in real time — pull the authoritative
        // list so it shows with a real requestId (accept/reject works instantly).
        if ((m as { type?: string }).type === 'friend_request_received' && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'list_friends' }));
        }
      } catch {
        /* ignore malformed */
      }
    };
    ws.onclose = () => {
      dispatch({ type: '_connected', value: false });
    };
    // Background keepalive reconnects must stay silent — only surface a connection
    // error when the user actively triggered this connection (find_match, etc.).
    ws.onerror = () => { if (!opts?.silent) dispatch({ type: 'error', message: t('error.connect') }); };
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

  // Presence: keep an authenticated socket open whenever signed in (cold start +
  // after matches) so friend requests arrive in real time. Reconnects if dropped.
  useEffect(() => {
    const uid = state.profile?.userId;
    const name = state.profile?.displayName;
    if (!uid || !name) return;
    const ensure = () => {
      const ws = wsRef.current;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
      connectAndSend({ type: 'register', name, userId: uid }, { silent: true });
    };
    ensure();
    const iv = setInterval(ensure, 7000);
    return () => clearInterval(iv);
  }, [state.profile?.userId, state.profile?.displayName, connectAndSend]);

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
    openProfile: () => dispatch({ type: '_phase', phase: 'profile' }),
    closeProfile: () => dispatch({ type: '_phase', phase: 'home' }),
    openMatchHistory: () => {
      // Data only — match history now shows as a centered popup, not a fullscreen phase.
      send({ type: 'list_match_history' });
    },
    closeMatchHistory: () => dispatch({ type: '_phase', phase: 'home' }),
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
    setUsername: (username: string) => {
      const userId = state.profile?.userId;
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        send({ type: 'set_username', username, userId });
      } else {
        connectAndSend({ type: 'set_username', username, userId });
      }
    },
    findMatch: (options?: GameOptions) => {
      // Carry the registered name + account id: this fresh socket hasn't sent
      // `register`, so without them the player would be a nameless "Oyuncu" with
      // no trophies awarded.
      dispatch({ type: '_set_game_options', options: options ?? null } as any);
      connectAndSend({ type: 'find_match', name: state.profile?.displayName, userId: state.profile?.userId, options });
    },
    cancelSearch: () => {
      wsRef.current?.close();
      wsRef.current = null;
      dispatch({ type: '_reset' });
    },
    createRoom: (name: string, options?: GameOptions) =>
      connectAndSend({ type: 'create_room', name, userId: state.profile?.userId, options }),
    createSolo: (name: string, options?: GameOptions) => {
      // Try online first; fall back to offline if no network
      NetInfo.fetch().then((netState) => {
        if (netState.isConnected) {
          connectAndSend({ type: 'create_solo', name, userId: state.profile?.userId, options });
        } else {
          // Offline bot match
          const room = new OfflineRoom({
            dispatch,
            difficulty: options?.difficulty ?? 'medium',
            scope: options?.scope ?? { type: 'all' },
            gameMode: options?.mode ?? 'team-team',
            playerName: name,
            playerTrophies: state.profile?.trophies ?? 0,
            playerArena: state.profile?.arena ?? { name: 'Mahalle Sahası', icon: '🏟️', minTrophies: 0 },
          });
          offlineRoomRef.current = room;
          room.start();
        }
      }).catch(() => {
        // NetInfo failed — try online anyway
        connectAndSend({ type: 'create_solo', name, userId: state.profile?.userId, options });
      });
    },
    joinRoom: (code: string, name: string) =>
      connectAndSend({ type: 'join_room', code: code.toUpperCase(), name, userId: state.profile?.userId }),
    start: () => {
      if (offlineRoomRef.current) return offlineRoomRef.current.start();
      send({ type: 'start' });
    },
    pickTeam: (clubId: number) => {
      if (offlineRoomRef.current) {
        dispatch({ type: '_picked' });
        offlineRoomRef.current.handlePick(clubId);
        return;
      }
      send({ type: 'pick_team', clubId });
      dispatch({ type: '_picked' });
    },
    pickCountry: (country: string) => {
      send({ type: 'pick_country', country });
      dispatch({ type: '_picked' });
    },
    pickLetter: (letter: string) => {
      send({ type: 'pick_letter', letter });
      dispatch({ type: '_picked' });
    },
    searchClubs: (q: string) => {
      if (offlineRoomRef.current) return offlineRoomRef.current.searchClubs(q);
      send({ type: 'search_clubs', reqId: 'q', q });
    },
    submitGuess: (text: string) => {
      if (offlineRoomRef.current) return void offlineRoomRef.current.submitGuess(text);
      send({ type: 'submit_guess', text });
    },
    pass: () => {
      if (offlineRoomRef.current) return offlineRoomRef.current.pass();
      send({ type: 'pass' });
    },
    ready: () => {
      if (offlineRoomRef.current) {
        dispatch({ type: '_ready' as any });
        offlineRoomRef.current.ready();
        return;
      }
      send({ type: 'ready' });
      dispatch({ type: '_ready' as any });
    },
    playAgain: () => send({ type: 'play_again' }),
    acceptRematch: () => send({ type: 'rematch_response', accept: true }),
    declineRematch: () => send({ type: 'rematch_response', accept: false }),
    sendEmote: (emoteId: string) => send({ type: 'send_emote', emoteId }),
    buyEmote: (emoteId: string) => send({ type: 'buy_emote', emoteId }),
    equipEmotes: (emoteIds: string[]) => send({ type: 'equip_emotes', emoteIds }),
    // Friends — via WebSocket for real-time notifications.
    loadFriends: () => send({ type: 'list_friends' }),
    sendFriendRequest: (targetCode?: string, targetUsername?: string) =>
      send({ type: 'send_friend_request', targetCode, targetUsername }),
    respondFriendRequest: (requestId: string, accept: boolean) =>
      send({ type: 'respond_friend_request', requestId, accept }),
    removeFriend: (friendId: string) => send({ type: 'remove_friend', friendId }),
    searchUsers: (query: string) => send({ type: 'search_users', query }),
    inviteFriendMatch: (friendId: string, friendName: string, options?: GameOptions) => {
      send({ type: 'invite_friend_match', friendId, options });
      dispatch({ type: '_set_outgoing', invite: { toId: friendId, toName: friendName, expiresAt: Date.now() + 30_000 } });
    },
    cancelMatchInvite: (toId: string) => {
      send({ type: 'cancel_match_invite', toId });
      dispatch({ type: '_set_outgoing', invite: null });
    },
    respondMatchInvite: (fromId: string, accept: boolean) => {
      send({ type: 'respond_match_invite', fromId, accept });
      dispatch({ type: '_dismiss_invite' });
    },
    getUserProfile: (userId: string) => send({ type: 'get_user_profile', userId }),
    closeUserProfile: () => dispatch({ type: '_close_profile' }),
    clearNotice: () => dispatch({ type: '_clear_notice' }),
    dismissMatchInvite: () => dispatch({ type: '_dismiss_invite' }),
    findMatchAgain: () => {
      const options = state.lastGameOptions ?? undefined;
      dispatch({ type: '_set_game_options', options: options ?? null } as any);
      connectAndSend({ type: 'find_match', name: state.profile?.displayName, userId: state.profile?.userId, options });
    },
    leave: () => {
      if (offlineRoomRef.current) {
        offlineRoomRef.current.leave();
        offlineRoomRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
      dispatch({ type: '_reset' });
    },
  };

  return { state, actions };
}
