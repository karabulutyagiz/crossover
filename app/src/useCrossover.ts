import { useCallback, useEffect, useReducer, useRef } from 'react';
import { AppState, type AppStateStatus, InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
// NetInfo may not be available in Expo Go — graceful fallback
let NetInfo: any;
try { NetInfo = require('@react-native-community/netinfo').default; } catch { NetInfo = null; }
import { SERVER_URL, HTTP_URL, APP_BUILD_NUMBER } from './config';
import { t } from './i18n';
import { OfflineRoom } from './offline/room';
import { initOfflineDB } from './offline/db';
import { captureError, track } from './telemetry';
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
  PlayerRef,
  ProfileView,
  PublicProfile,
  RoomView,
  RoundResult,
  ScopesList,
  ServerMsg,
  MessageView,
  ConversationView,
} from './protocol';

export type Phase = 'home' | 'arenas' | 'leaderboard' | 'matchHistory' | 'profile' | 'searching' | 'matchup' | 'lobby' | 'countdown' | 'pick' | 'reveal' | 'guess' | 'result';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  trophies: number;
  wins: number;
  losses: number;
  arena: { name: string; icon: string; minTrophies: number };
  avatar?: string | null;
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
  playerResults: PlayerRef[];
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
  // Direct messages
  chatWith: string | null;
  chatMessages: MessageView[];
  conversations: ConversationView[];
  totalUnread: number;
  typingFrom: Record<string, boolean>;  // userId → isTyping
  // Transient top banner notification (friend request / new message). Auto-dismisses.
  banner: { id: number; kind: 'friend_request' | 'message'; name: string; body?: string; userId?: string } | null;
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
  playerResults: [],
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
  chatWith: null,
  chatMessages: [],
  conversations: [],
  totalUnread: 0,
  typingFrom: {},
  banner: null,
};

const PROFILE_KEY = '@crossover_profile';
const LAST_USER_ID_KEY = '@crossover_last_user_id';
const LAST_AUTH_PROVIDER_KEY = '@crossover_last_auth_provider';
const STALE_SOCKET_MS = 120_000;

type Action =
  | ServerMsg
  | { type: '_connected'; value: boolean }
  | { type: '_reset' }
  | { type: '_logout' }
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
  | { type: '_clear_banner' }
  | { type: '_ready' }
  | { type: '_set_game_options'; options: GameOptions | null }
  | { type: '_clear_emote'; playerId: string };

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case '_connected':
      // A fresh (re)connect clears any lingering "couldn't connect" error.
      return { ...state, connected: action.value, error: action.value ? null : state.error };
    case '_reset':
      return { ...initialState, scopes: state.scopes, profile: state.profile, friends: state.friends, isQuickMatch: false, opponentForfeit: false };
    case '_logout':
      return { ...initialState, scopes: state.scopes };
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
      ], banner: { id: (state.banner?.id ?? 0) + 1, kind: 'friend_request', name: (action as any).fromName, userId: (action as any).fromId } };
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
    case '_clear_banner' as any:
      return { ...state, banner: null };
    case '_open_chat' as any:
      return { ...state, chatWith: (action as any).userId, chatMessages: [] };
    case '_close_chat' as any:
      return { ...state, chatWith: null, chatMessages: [] };
    case 'message_received': {
      const msg = (action as any).message as MessageView;
      let nextMessages = state.chatMessages;
      let nextConvos = state.conversations;
      let nextUnread = state.totalUnread;
      const myId = state.profile?.userId;
      const partnerId = msg.fromId === myId ? msg.toId : msg.fromId;

      // Add to current chat if open with this partner
      if (state.chatWith && (msg.fromId === state.chatWith || msg.toId === state.chatWith)) {
        if (!state.chatMessages.some(m => m.id === msg.id)) {
          nextMessages = [...state.chatMessages, msg];
        }
      }

      // Update conversation list
      const existingIdx = nextConvos.findIndex(c => c.userId === partnerId);
      if (existingIdx >= 0) {
        const updated = { ...nextConvos[existingIdx]!, lastMessage: msg.body, lastMessageAt: msg.createdAt };
        // Increment unread if message is from the partner and we're NOT in that chat
        if (msg.fromId !== myId && state.chatWith !== partnerId) {
          updated.unreadCount = (updated.unreadCount ?? 0) + 1;
          nextUnread = nextUnread + 1;
        }
        nextConvos = [updated, ...nextConvos.filter((_, i) => i !== existingIdx)];
      } else {
        const isIncoming = msg.fromId !== myId;
        nextConvos = [{
          userId: partnerId, displayName: msg.fromId === myId ? '' : msg.fromName,
          online: true, lastMessage: msg.body, lastMessageAt: msg.createdAt,
          unreadCount: isIncoming && state.chatWith !== partnerId ? 1 : 0,
          avatar: state.friends.find(f => f.userId === partnerId)?.avatar ?? null,
        }, ...nextConvos];
        if (isIncoming && state.chatWith !== partnerId) nextUnread++;
      }
      // Clear typing indicator for sender
      const nextTyping = { ...state.typingFrom };
      delete nextTyping[msg.fromId];

      // Top banner for an incoming message while NOT viewing that chat.
      const showBanner = msg.fromId !== myId && state.chatWith !== partnerId;
      const nextBanner = showBanner
        ? { id: (state.banner?.id ?? 0) + 1, kind: 'message' as const, name: msg.fromName, body: msg.body, userId: msg.fromId }
        : state.banner;

      return { ...state, chatMessages: nextMessages, conversations: nextConvos, totalUnread: nextUnread, typingFrom: nextTyping, banner: nextBanner };
    }
    case 'message_list':
      return { ...state, chatMessages: (action as any).messages ?? [] };
    case 'conversation_list': {
      const convos = (action as any).conversations as ConversationView[] ?? [];
      return { ...state, conversations: convos, totalUnread: convos.reduce((s: number, c: ConversationView) => s + c.unreadCount, 0) };
    }
    case 'messages_marked_read':
      return {
        ...state,
        conversations: state.conversations.map(c =>
          c.userId === (action as any).fromUserId ? { ...c, unreadCount: 0 } : c
        ),
        totalUnread: state.conversations.reduce((s, c) =>
          s + (c.userId === (action as any).fromUserId ? 0 : c.unreadCount), 0
        ),
      };
    case 'typing':
      return { ...state, typingFrom: { ...state.typingFrom, [(action as any).fromUserId]: (action as any).isTyping } };

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
          ? {
              ...state.profile,
              trophies: action.trophies,
              arena: action.arena,
              diamonds: typeof (action as any).diamonds === 'number' ? (action as any).diamonds : state.profile.diamonds,
            }
          : state.profile,
        notice: (action as any).arenaReward > 0 ? `+${(action as any).arenaReward} 💎` : state.notice,
      };
    case '_clear_emote': {
      // Remove a shown emote so it doesn't persist in state and re-appear when the
      // match screen (and its EmoteLayer) remounts on a phase change.
      if (!state.emotes[action.playerId]) return state;
      const next = { ...state.emotes };
      delete next[action.playerId];
      return { ...state, emotes: next };
    }
    case 'emote': {
      const n = state.emoteSeq + 1;
      return { ...state, emoteSeq: n, emotes: { ...state.emotes, [action.fromId]: { emoteId: action.emoteId, n } } };
    }
    case 'emote_purchased':
      return { ...state, profile: action.profile };
    case 'avatar_purchased':
      return { ...state, profile: action.profile };
    case 'diamonds_granted': {
      const g = (action as { granted?: number }).granted ?? 0;
      // Diamonds → toast; Social Pack / silent re-validate (granted 0) → no toast, the
      // store's "Aktif" badge reflects it. Always refresh the profile.
      return { ...state, profile: (action as { profile: ProfileView }).profile, notice: g > 0 ? `+${g} 💎` : state.notice };
    }
    case 'ad_reward_result': {
      // Refresh the authoritative balance on success; the Store screen shows the
      // celebration/alert itself (state.notice isn't rendered on that tab).
      const a = action as { ok?: boolean; profile?: ProfileView };
      return a.ok && a.profile ? { ...state, profile: a.profile } : state;
    }

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
    case 'player_results':
      return { ...state, playerResults: (action as any).players ?? [] };
    case 'opponent_left':
      if (action.forfeit) {
        return { ...state, opponentForfeit: true };
      }
      return { ...state, phase: 'lobby', error: t('error.opponentLeft'), teams: null, result: null, locked: null };
    case 'error':
      // Internal protocol noise — never surface to the user.
      if (action.message === 'Create or join a room first') return state;
      // IAP receipt validation errors (sandbox/production mismatch) — silent.
      if (/receipt|makbuz|21002|21007|21008/i.test(action.message ?? '')) return state;
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
  const connectingSince = useRef(0); // when the current socket started CONNECTING (0 = not connecting)
  const lastSocketActivity = useRef(0);
  const pendingAfterAuth = useRef<ClientMsg | null>(null);
  const pendingAfterResume = useRef<ClientMsg | null>(null);
  const offlineRoomRef = useRef<OfflineRoom | null>(null);
  const lastUserIdRef = useRef<string | null>(null);
  const lastAuthProviderRef = useRef<'apple' | 'google' | 'facebook' | null>(null);

  // Seed the offline DB only AFTER first paint + interactions settle, so the one-time 8MB
  // load never blocks/janks app launch. (Only runs once; subsequent launches no-op.)
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => { initOfflineDB().catch(() => {}); });
    return () => task.cancel?.();
  }, []);

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
    AsyncStorage.getItem(LAST_USER_ID_KEY)
      .then((userId) => {
        if (userId) lastUserIdRef.current = userId;
      })
      .catch(() => {});
    AsyncStorage.getItem(LAST_AUTH_PROVIDER_KEY)
      .then((provider) => {
        if (provider === 'apple' || provider === 'google' || provider === 'facebook') {
          lastAuthProviderRef.current = provider;
        }
      })
      .catch(() => {});
  }, []);

  // Persist profile whenever it changes from server messages.
  const prevProfile = useRef<ProfileView | null>(null);
  useEffect(() => {
    if (state.profile && state.profile !== prevProfile.current) {
      prevProfile.current = state.profile;
      lastUserIdRef.current = state.profile.userId;
      saveProfile(state.profile);
      AsyncStorage.setItem(LAST_USER_ID_KEY, state.profile.userId).catch(() => {});
    }
  }, [state.profile]);

  // Auto-clear shown emotes ~3.5s after the latest one arrives. Emotes are
  // one-shot: leaving them in state made a sent emote re-appear every time a
  // match screen (and its EmoteLayer) remounted on a phase change.
  useEffect(() => {
    const ids = Object.keys(state.emotes);
    if (ids.length === 0) return;
    const timers = ids.map((pid) => setTimeout(() => dispatch({ type: '_clear_emote', playerId: pid }), 3500));
    return () => timers.forEach(clearTimeout);
  }, [state.emoteSeq]);

  // A pending Apple IAP verification — resolved when the server confirms the grant
  // (diamonds_granted) or rejected on error, so we only finishTransaction once paid.
  const pendingVerify = useRef<{ resolve: () => void; reject: (e: Error) => void } | null>(null);
  // A pending rewarded-ad grant — its own channel (ad_reward_result) so it can never
  // resolve an in-flight IAP verification by sharing the diamonds_granted message.
  const pendingAdReward = useRef<{ resolve: (granted: number) => void; reject: (e: Error) => void } | null>(null);

  const connectAndSend = useCallback((first: ClientMsg, opts?: { silent?: boolean }) => {
    // Detach the previous socket's handlers BEFORE closing it. Otherwise its
    // onclose fires a tick later (after we've already created the new socket) and
    // clobbers the shared connectingSince timestamp — defeating the stuck-CONNECTING
    // grace window and thrashing the fresh socket. Detaching also stops a stale
    // onmessage from dispatching after we've moved on.
    const prev = wsRef.current;
    if (prev) {
      prev.onopen = null; prev.onmessage = null; prev.onclose = null; prev.onerror = null;
      try { prev.close(); } catch { /* ignore */ }
    }
    const ws = new WebSocket(SERVER_URL);
    wsRef.current = ws;
    connectingSince.current = Date.now();
    ws.onopen = () => {
      if (wsRef.current !== ws) return; // superseded by a newer socket
      connectingSince.current = 0;
      lastSocketActivity.current = Date.now();
      dispatch({ type: '_connected', value: true });
      ws.send(JSON.stringify(first));
    };
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(String(e.data)) as ServerMsg;
        lastSocketActivity.current = Date.now();
        dispatch(m);
        const mt = (m as { type?: string }).type;
        if (mt === 'profile' && pendingAfterAuth.current && ws.readyState === WebSocket.OPEN) {
          const pending = pendingAfterAuth.current;
          pendingAfterAuth.current = null;
          ws.send(JSON.stringify(pending));
        }
        if (mt === 'room_state' && pendingAfterResume.current && ws.readyState === WebSocket.OPEN) {
          const pending = pendingAfterResume.current;
          pendingAfterResume.current = null;
          ws.send(JSON.stringify(pending));
        }
        // Resolve/reject a pending IAP verification.
        if (mt === 'diamonds_granted') { pendingVerify.current?.resolve(); pendingVerify.current = null; }
        else if (mt === 'error' && pendingVerify.current) { pendingVerify.current.reject(new Error((m as { message?: string }).message ?? 'error')); pendingVerify.current = null; }
        // Rewarded-ad grant result — its own channel, never touches pendingVerify.
        if (mt === 'ad_reward_result') {
          const r = m as { ok?: boolean; granted?: number; error?: string };
          if (r.ok) pendingAdReward.current?.resolve(r.granted ?? 0);
          else pendingAdReward.current?.reject(new Error(r.error ?? 'Ödül verilemedi'));
          pendingAdReward.current = null;
        }
        // A friend request just arrived in real time — pull the authoritative
        // list so it shows with a real requestId (accept/reject works instantly).
        if (mt === 'friend_request_received' && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'list_friends' }));
        }
      } catch (err) {
        captureError(err, { where: 'ws_onmessage' });
      }
    };
    ws.onclose = () => {
      if (wsRef.current !== ws) return; // an old, superseded socket closing — ignore
      connectingSince.current = 0;
      dispatch({ type: '_connected', value: false });
    };
    // Background keepalive reconnects must stay silent — only surface a connection
    // error when the user actively triggered this connection (find_match, etc.).
    ws.onerror = () => { if (!opts?.silent) dispatch({ type: 'error', message: t('error.connect') }); };
  }, []);

  const send = useCallback((msg: ClientMsg) => {
    const ws = wsRef.current;
    const canReconnectWithoutRoom = ['home', 'arenas', 'leaderboard', 'matchHistory', 'profile'].includes(state.phase);
    const canResumeRoom = Boolean(state.room?.code && state.profile?.userId && !canReconnectWithoutRoom);
    const staleOpen = ws?.readyState === WebSocket.OPEN && lastSocketActivity.current > 0 && Date.now() - lastSocketActivity.current > STALE_SOCKET_MS;
    const reconnectAndSendAuthed = () => {
      const uid = state.profile?.userId;
      const name = state.profile?.displayName;
      if (uid && name) {
        pendingAfterAuth.current = msg;
        connectAndSend({ type: 'register', name, userId: uid }, { silent: true });
      } else {
        connectAndSend(msg, { silent: true });
      }
    };
    if (staleOpen && canReconnectWithoutRoom) {
      reconnectAndSendAuthed();
      return;
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else {
      if (canReconnectWithoutRoom) {
        reconnectAndSendAuthed();
        return;
      }
      if (canResumeRoom && state.room && state.profile) {
        pendingAfterResume.current = msg;
        connectAndSend({ type: 'resume_room', code: state.room.code, userId: state.profile.userId }, { silent: true });
        track('room_resume_attempt', { phase: state.phase });
        return;
      }
      // Connection lost — reset to home so user can start fresh
      dispatch({ type: 'error', message: t('error.disconnected') });
      dispatch({ type: '_reset' });
    }
  }, [connectAndSend, state.phase, state.profile?.userId, state.profile?.displayName, state.room?.code]);

  // Presence: keep an authenticated socket open whenever signed in (cold start +
  // after matches) so friend requests arrive in real time. Reconnects if dropped.
  useEffect(() => {
    const uid = state.profile?.userId;
    const name = state.profile?.displayName;
    if (!uid || !name) return;
    const ensure = () => {
      const ws = wsRef.current;
      const staleOpen = ws?.readyState === WebSocket.OPEN && lastSocketActivity.current > 0 && Date.now() - lastSocketActivity.current > STALE_SOCKET_MS;
      if (staleOpen && ['home', 'arenas', 'leaderboard', 'matchHistory', 'profile'].includes(state.phase)) {
        connectAndSend({ type: 'register', name, userId: uid }, { silent: true });
        return;
      }
      if (ws && ws.readyState === WebSocket.OPEN) return;
      // A socket stuck in CONNECTING (e.g. suspended while the app was backgrounded)
      // never opens or closes — the old code treated that as "fine" and so never
      // reconnected, leaving the app frozen until a restart. Treat a CONNECTING
      // socket older than 12s as dead and force a fresh connection.
      if (ws && ws.readyState === WebSocket.CONNECTING && Date.now() - connectingSince.current < 12000) return;
      connectAndSend({ type: 'register', name, userId: uid }, { silent: true });
    };
    ensure();
    const iv = setInterval(ensure, 7000);
    // Re-check the connection the moment the app returns to the foreground. iOS
    // suspends in-flight sockets when backgrounded (e.g. after a home-indicator
    // swipe away); on resume `ensure()` reconnects a dead/stuck socket right away
    // instead of waiting for the next interval tick — while its 12s grace avoids
    // killing a connect that's still legitimately in progress (iOS can fire several
    // 'active' events in quick succession around foregrounding).
    const onAppState = (s: AppStateStatus) => { if (s === 'active') ensure(); };
    const appSub = AppState.addEventListener('change', onAppState);
    return () => { clearInterval(iv); appSub.remove(); };
  }, [state.profile?.userId, state.profile?.displayName, state.phase, connectAndSend]);

  // Load available leagues/countries once for the scope picker.
  useEffect(() => {
    let alive = true;
    fetch(`${HTTP_URL}/config`)
      .then((r) => r.json())
      .then((cfg: { maintenance?: boolean; minIosBuild?: number }) => {
        if (!alive) return;
        if (cfg.maintenance) dispatch({ type: 'error', message: 'Bakım modundayız, birazdan tekrar dene' });
        if (typeof cfg.minIosBuild === 'number' && APP_BUILD_NUMBER < cfg.minIosBuild) {
          dispatch({ type: 'error', message: 'Yeni sürüm gerekli. Lütfen uygulamayı güncelle.' });
        }
      })
      .catch(() => {});
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
    // Send an Apple IAP receipt to the server for validation; resolves when the
    // server confirms diamonds were granted (diamonds_granted), rejects otherwise.
    verifyPurchase: (receipt: string) => new Promise<void>((resolve, reject) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) { reject(new Error('disconnected')); return; }
      pendingVerify.current = { resolve, reject };
      ws.send(JSON.stringify({ type: 'verify_purchase', receipt }));
      setTimeout(() => {
        if (pendingVerify.current) { pendingVerify.current.reject(new Error('timeout')); pendingVerify.current = null; }
      }, 20000);
    }),
    // Watched a rewarded ad → ask the server to credit diamonds (server-capped).
    // Resolves with the granted amount (server-authoritative) on its own
    // ad_reward_result channel, or rejects with the cap/throttle reason.
    grantAdReward: () => new Promise<number>((resolve, reject) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) { reject(new Error('disconnected')); return; }
      pendingAdReward.current = { resolve, reject };
      ws.send(JSON.stringify({ type: 'grant_ad_reward' }));
      setTimeout(() => {
        if (pendingAdReward.current) { pendingAdReward.current.reject(new Error('timeout')); pendingAdReward.current = null; }
      }, 15000);
    }),
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
    // Guest login: the server creates a fresh account with an auto "M"+9-digit
    // username and returns its profile, which is persisted like any other — so the
    // same guest account (and its progress) comes back on the next launch.
    guestLogin: () => connectAndSend({ type: 'guest' }),
    // Sign in with Apple / Google / Facebook: send the provider's identity token
    // to the server, which verifies it and returns the account profile.
    authWith: (provider: 'apple' | 'google' | 'facebook', token: string, name?: string) => {
      const canReuseLastUser = !lastAuthProviderRef.current || lastAuthProviderRef.current === provider;
      const userId = canReuseLastUser ? (state.profile?.userId ?? lastUserIdRef.current ?? undefined) : undefined;
      lastAuthProviderRef.current = provider;
      AsyncStorage.setItem(LAST_AUTH_PROVIDER_KEY, provider).catch(() => {});
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        send({ type: 'auth', provider, token, name, userId });
      } else {
        connectAndSend({ type: 'auth', provider, token, name, userId });
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
      track('match_find', { mode: options?.mode ?? 'team-team' });
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
      track('solo_create', { difficulty: options?.difficulty ?? 'medium', mode: options?.mode ?? 'team-team' });
      // Try online first; fall back to offline if no network
      const checkNet = NetInfo ? NetInfo.fetch() : Promise.resolve({ isConnected: true });
      checkNet.then((netState: any) => {
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
            playerAvatar: state.profile?.avatar ?? null,
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
    searchPlayers: (q: string) => send({ type: 'search_players', q }),
    pickPlayer: (playerId: number) => {
      send({ type: 'pick_player', playerId });
      dispatch({ type: '_picked' });
    },
    submitGuess: (text: string) => {
      track('guess_submit', { length: text.trim().length });
      if (offlineRoomRef.current) return void offlineRoomRef.current.submitGuess(text);
      send({ type: 'submit_guess', text });
    },
    pass: () => {
      track('round_pass');
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
    clearEmote: (playerId: string) => dispatch({ type: '_clear_emote', playerId }),
    buyEmote: (emoteId: string) => send({ type: 'buy_emote', emoteId }),
    equipEmotes: (emoteIds: string[]) => send({ type: 'equip_emotes', emoteIds }),
    buyAvatar: (avatarId: string) => send({ type: 'buy_avatar', avatarId }),
    setAvatar: (avatar: string | null) => send({ type: 'set_avatar', avatar }),
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
    clearBanner: () => dispatch({ type: '_clear_banner' }),
    dismissMatchInvite: () => dispatch({ type: '_dismiss_invite' }),
    findMatchAgain: () => {
      const options = state.lastGameOptions ?? undefined;
      dispatch({ type: '_set_game_options', options: options ?? null } as any);
      connectAndSend({ type: 'find_match', name: state.profile?.displayName, userId: state.profile?.userId, options });
    },
    // ---- Direct Messages ----
    loadConversations: () => send({ type: 'list_conversations' }),
    openChat: (userId: string) => {
      dispatch({ type: '_open_chat', userId } as any);
      send({ type: 'list_messages', withUserId: userId });
      send({ type: 'mark_read', fromUserId: userId });
    },
    closeChat: () => dispatch({ type: '_close_chat' } as any),
    sendMessage: (toUserId: string, body: string) => {
      if (!body.trim()) return;
      send({ type: 'send_message', toUserId, body: body.trim() });
    },
    markRead: (fromUserId: string) => send({ type: 'mark_read', fromUserId }),
    typingStart: (toUserId: string) => send({ type: 'typing_start', toUserId }),
    typingStop: (toUserId: string) => send({ type: 'typing_stop', toUserId }),
    leave: () => {
      if (offlineRoomRef.current) {
        offlineRoomRef.current.leave();
        offlineRoomRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
      dispatch({ type: '_reset' });
    },
    logout: async () => {
      const lastUserId = state.profile?.userId ?? lastUserIdRef.current;
      if (offlineRoomRef.current) {
        offlineRoomRef.current.leave();
        offlineRoomRef.current = null;
      }
      const ws = wsRef.current;
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        try { ws.close(); } catch { /* ignore */ }
      }
      wsRef.current = null;
      connectingSince.current = 0;
      prevProfile.current = null;
      pendingVerify.current = null;
      pendingAdReward.current = null;
      lastUserIdRef.current = lastUserId ?? null;
      try {
        if (lastUserId) await AsyncStorage.setItem(LAST_USER_ID_KEY, lastUserId);
        await AsyncStorage.removeItem(PROFILE_KEY);
      } catch {
        // Even if storage removal fails, still force the UI back to login.
      }
      dispatch({ type: '_logout' });
    },
  };

  return { state, actions };
}
