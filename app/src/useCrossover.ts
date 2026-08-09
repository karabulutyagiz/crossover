import { useCallback, useEffect, useReducer, useRef } from 'react';
import { AppState, type AppStateStatus, InteractionManager, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
// NetInfo may not be available in Expo Go — graceful fallback
let NetInfo: any;
try { NetInfo = require('@react-native-community/netinfo').default; } catch { NetInfo = null; }
import { SERVER_URLS, setActiveServerUrl, fetchApi, APP_BUILD_NUMBER } from './config';
import { currentLang, t } from './i18n';
import { getPushToken, requestPushPermission } from './notifications';
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
  BlockedUserView,
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
  frame?: string | null; // takılı profil çerçevesi
}

export type FriendInfo = FriendView;

export interface GameState {
  connected: boolean;
  // Bu hesabın giriş yolu: apple/google/facebook = sosyal, null = MİSAFİR.
  // Misafir hesaplarda ad değiştirme yoktur (UI bu alana bakar).
  authProvider: 'apple' | 'google' | 'facebook' | null;
  // ELLE kurulan özel oda lobiden dolduğunda true: ev sahibi matchup
  // gösteriminden sonra maçı OTOMATİK başlatmalı (hızlı eşleşme/davet
  // odalarını sunucu başlatır; onlarda bu bayrak hiç kalkmaz).
  matchupAutoStart: boolean;
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
  trophyDelta: { trophies: number; delta: number; arena: ArenaView; arenaReward?: number; shielded?: boolean } | null;
  // Maç sonu seviye ilerlemesi (xp_update) — popup App katmanında maç ÇIKIŞINDA gösterilir
  xpGain: { xp: number; level: number; xpForNext: number; gained: number; leveledUp: { level: number; diamonds: number; emoteId?: string; powerId?: string }[]; boosted?: boolean } | null;
  // Seviye Yolu'nda son toplanan ödül — modal içi animasyonlar bunu izler
  lastClaim: { level: number; diamonds: number; emoteId: string | null; frameTier: string | null; powerId: string | null; track: 'free' | 'premium'; seq: number } | null;
  // Profil istatistikleri (get_my_stats ile istenir): seri rekoru + mod kırılımı
  myStats: { winStreak: number; bestStreak: number; modes: { mode: string; wins: number; losses: number }[] } | null;
  leaderboard: LeaderboardEntry[];
  friends: FriendInfo[];
  friendRequests: FriendRequestView[];
  userSearchResults: { userId: string; displayName: string }[];
  matchInvite: { fromId: string; fromName: string; options?: GameOptions } | null;
  // An invite I sent that's awaiting the friend's answer (30s window).
  outgoingInvite: { toId: string; toName: string; expiresAt: number } | null;
  // Server /config says this binary is below minIosBuild — App.tsx hard-gates on it.
  updateRequired: boolean;
  // A friend's public profile I'm currently viewing.
  viewProfile: PublicProfile | null;
  // Transient success notice (e.g. "friend request sent"), shown green then cleared.
  notice: string | null;
  // Arkadaş işlemleri geri bildirimi — YALNIZ Arkadaşlar ekranında gösterilir
  // (zaten arkadaşsınız / davet reddedildi gibi mesajlar ana oyun ekranında çıkmaz).
  friendNotice: { text: string; kind: 'error' | 'ok' } | null;
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
  usedClubIds: number[];   // bu maçta seçilmiş takımlar (karart+kilitle)
  usedCountries: string[]; // bu maçta seçilmiş ülkeler (normalize edilmiş)
  revealMode: GameMode | null;
  revealCountry: string | null;
  revealLetter: string | null;
  // emotes currently shown over the match, keyed by the player who sent them.
  // `n` increases on every emote so the UI can re-trigger the same one.
  emotes: Record<string, { emoteId: string; n: number }>;
  emoteSeq: number;
  isQuickMatch: boolean;
  opponentForfeit: boolean;
  // Maç ortasında ÇIKIŞ (forfeit) = kaybetme. Kupa cezası (trophy_update) reset
  // SONRASI gelir; onunla kaybetme popup'ı gösterilir. null = gösterilecek bir şey yok.
  forfeitLoss: { delta: number; trophies: number; arena: ArenaView; youScore: number; oppScore: number; opponentName: string } | null;
  lastGameOptions: GameOptions | null;
  // Direct messages
  chatWith: string | null;
  chatMessages: MessageView[];
  conversations: ConversationView[];
  totalUnread: number;
  typingFrom: Record<string, boolean>;  // userId → isTyping
  blockedUsers: BlockedUserView[];      // guideline 1.2 — shown in Settings, unblockable there
  // Son elmas-harcamalı satın alma — App bunun seq'ini izleyip "Satın Alma
  // Başarılı" onayını gösterir (kullanıcı isteği: her satın alma kendini duyursun).
  // Elmas PAKETLERİ hariç: onların kutlaması DiamondCelebration.
  lastPurchase: { kind: 'power' | 'premiumRoad' | 'emote' | 'avatar'; id?: string; seq: number } | null;
  // Transient top banner notification (friend request / new message). Auto-dismisses.
  banner: { id: number; kind: 'friend_request' | 'message'; name: string; body?: string; userId?: string } | null;
}

// --- Messaging helpers: stable ordering + de-dupe, so live pushes and (possibly
// out-of-order / duplicated) list responses converge to one time-sorted view. ---
function compareIsoAsc(a: string, b: string): number {
  const ta = Date.parse(a), tb = Date.parse(b);
  if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return ta - tb;
  return a.localeCompare(b);
}
function mergeMessages(existing: MessageView[], incoming: MessageView[]): MessageView[] {
  const by = new Map<string, MessageView>();
  for (const m of existing) by.set(m.id, m);
  for (const m of incoming) by.set(m.id, m);
  return [...by.values()].sort((x, y) => compareIsoAsc(x.createdAt, y.createdAt) || x.id.localeCompare(y.id));
}
function sortConversations(convos: ConversationView[]): ConversationView[] {
  return [...convos].sort((a, b) => compareIsoAsc(b.lastMessageAt, a.lastMessageAt) || a.userId.localeCompare(b.userId));
}

export const initialState: GameState = {
  connected: false,
  authProvider: null,
  matchupAutoStart: false,
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
  xpGain: null,
  lastClaim: null,
  myStats: null,
  leaderboard: [],
  friends: [],
  friendRequests: [],
  userSearchResults: [],
  matchInvite: null,
  outgoingInvite: null,
  updateRequired: false,
  viewProfile: null,
  notice: null,
  friendNotice: null,
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
  usedClubIds: [],
  usedCountries: [],
  revealMode: null,
  revealCountry: null,
  revealLetter: null,
  emotes: {},
  emoteSeq: 0,
  isQuickMatch: false,
  opponentForfeit: false,
  forfeitLoss: null,
  lastGameOptions: null,
  chatWith: null,
  chatMessages: [],
  conversations: [],
  totalUnread: 0,
  typingFrom: {},
  blockedUsers: [],
  lastPurchase: null,
  banner: null,
};

const PROFILE_KEY = '@crossover_profile';
const LAST_USER_ID_KEY = '@crossover_last_user_id';
const LAST_AUTH_PROVIDER_KEY = '@crossover_last_auth_provider';
const SCOPES_KEY = '@crossover_scopes'; // cached leagues/countries/nationalities (load once, refresh in bg)
const ENDPOINT_KEY = '@crossover_endpoint'; // last server URL that connected on THIS network
// Per-host connect budget. A host that is DNS/proxy-blocked never errors — the
// socket just sits in CONNECTING — so each candidate needs its own deadline
// before we move to the next. Kept short enough that walking every endpoint
// still beats the old single 15s wait.
const CONNECT_TIMEOUT_MS = 6000;
const STALE_SOCKET_MS = 120_000;

type Action =
  | ServerMsg
  | { type: '_connected'; value: boolean }
  | { type: '_authProvider'; provider: 'apple' | 'google' | 'facebook' | null }
  | { type: '_xp_seen' } // XP küre yağmuru oynatıldı — kazanım tüketildi
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
  | { type: '_update_required' }
  | { type: '_clear_notice' }
  | { type: '_friend_notice'; text: string; kind: 'error' | 'ok' }
  | { type: '_clear_friend_notice' }
  | { type: '_clear_banner' }
  | { type: '_ready' }
  | { type: '_set_game_options'; options: GameOptions | null }
  | { type: '_clear_emote'; playerId: string }
  | { type: '_forfeit_loss'; delta: number; trophies: number; arena: ArenaView; youScore: number; oppScore: number; opponentName: string }
  | { type: '_clear_forfeit_loss' };

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case '_connected':
      // A fresh (re)connect clears any lingering "couldn't connect" error.
      return { ...state, connected: action.value, error: action.value ? null : state.error };
    case '_authProvider':
      return { ...state, authProvider: action.provider };
    case '_xp_seen':
      return { ...state, xpGain: null };
    case '_forfeit_loss':
      return { ...state, forfeitLoss: { delta: action.delta, trophies: action.trophies, arena: action.arena, youScore: action.youScore, oppScore: action.oppScore, opponentName: action.opponentName } };
    case '_clear_forfeit_loss':
      return state.forfeitLoss ? { ...state, forfeitLoss: null } : state;
    case '_reset':
      // xpGain korunur: XP küre yağmuru ana ekrana DÖNÜNCE akar (yeni maç
      // başlarken countdown case'i zaten temizler).
      return { ...initialState, scopes: state.scopes, profile: state.profile, friends: state.friends, authProvider: state.authProvider, xpGain: state.xpGain, isQuickMatch: false, opponentForfeit: false };
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
      // Reddedilme YALNIZ Arkadaşlar ekranında görünür — ana oyun ekranında değil.
      return {
        ...state,
        outgoingInvite: null,
        friendNotice: {
          text: state.outgoingInvite?.toName
            ? t('friends.inviteDeclinedBy', { name: state.outgoingInvite.toName })
            : t('friends.inviteDeclined'),
          kind: 'error',
        },
      };
    case 'match_invite_cancelled':
      return { ...state, matchInvite: null };
    case 'user_profile':
      return { ...state, viewProfile: (action as any).profile };
    case 'match_history_list':
      return { ...state, matchHistory: (action as any).matches ?? [] };
    case '_update_required' as any:
      return { ...state, updateRequired: true };
    case '_dismiss_invite' as any:
      return { ...state, matchInvite: null };
    case '_set_outgoing' as any:
      return { ...state, outgoingInvite: (action as any).invite };
    case '_close_profile' as any:
      return { ...state, viewProfile: null };
    case '_clear_notice' as any:
      return { ...state, notice: null };
    case '_friend_notice' as any:
      return { ...state, friendNotice: { text: (action as any).text, kind: (action as any).kind } };
    case '_clear_friend_notice' as any:
      return state.friendNotice ? { ...state, friendNotice: null } : state;
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

      // Add to current chat if open with this partner (merge = de-dupe + time-sort).
      // Reconciliation: when the SERVER echo of my own message lands, retire one
      // matching optimistic local- placeholder first (else the message doubles).
      if (state.chatWith === partnerId) {
        let base = state.chatMessages;
        if (msg.fromId === myId && !msg.id.startsWith('local-')) {
          // Retire the OLDEST local- placeholder from me — matched by ORDER, not
          // body: the server may censor the body, and a body-equality match then
          // left the raw local bubble next to the censored echo (double bubble).
          const li = base.findIndex((x) => x.id.startsWith('local-') && x.fromId === myId);
          if (li >= 0) base = [...base.slice(0, li), ...base.slice(li + 1)];
        }
        nextMessages = mergeMessages(base, [msg]);
      }

      // Update conversation list
      const existingIdx = nextConvos.findIndex(c => c.userId === partnerId);
      if (existingIdx >= 0) {
        const updated = {
          ...nextConvos[existingIdx]!,
          lastMessage: msg.body,
          lastMessageAt: msg.createdAt,
          displayName: nextConvos[existingIdx]!.displayName || state.friends.find(f => f.userId === partnerId)?.displayName || msg.fromName,
        };
        // Increment unread if message is from the partner and we're NOT in that chat
        if (msg.fromId !== myId && state.chatWith !== partnerId) {
          updated.unreadCount = (updated.unreadCount ?? 0) + 1;
          nextUnread = nextUnread + 1;
        }
        nextConvos = sortConversations([updated, ...nextConvos.filter((_, i) => i !== existingIdx)]);
      } else {
        const isIncoming = msg.fromId !== myId;
        nextConvos = [{
          userId: partnerId,
          // Outgoing-first message: msg.fromName is OUR name, so backfill the partner's
          // name from the friends list instead of showing an empty title.
          displayName: (msg.fromId === myId ? '' : msg.fromName) || state.friends.find(f => f.userId === partnerId)?.displayName || '',
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

      return { ...state, chatMessages: nextMessages, conversations: sortConversations(nextConvos), totalUnread: nextUnread, typingFrom: nextTyping, banner: nextBanner };
    }
    case 'message_list': {
      const withUserId = (action as any).withUserId as string | undefined;
      // Drop a stale history response for a chat we've since left / switched away from.
      if (withUserId && state.chatWith !== withUserId) return state;
      return { ...state, chatMessages: mergeMessages(state.chatMessages, (action as any).messages ?? []) };
    }
    case 'conversation_list': {
      const convos = sortConversations((action as any).conversations as ConversationView[] ?? []);
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

    // ---- User-generated-content safety (App Store guideline 1.2) ----
    case 'blocked_list':
      return { ...state, blockedUsers: (action as any).users ?? [] };
    case 'user_blocked': {
      // Drop the blocked person from every live list immediately — waiting for a
      // server refresh would leave them briefly visible and still tappable.
      const id = (action as any).userId as string;
      const conversations = state.conversations.filter((c) => c.userId !== id);
      return {
        ...state,
        friends: state.friends.filter((f) => f.userId !== id),
        conversations,
        totalUnread: conversations.reduce((s, c) => s + c.unreadCount, 0),
        chatWith: state.chatWith === id ? null : state.chatWith,
        chatMessages: state.chatWith === id ? [] : state.chatMessages,
      };
    }
    case 'user_unblocked':
      return { ...state, blockedUsers: state.blockedUsers.filter((b) => b.userId !== (action as any).userId) };
    case 'message_deleted': {
      const mid = (action as any).messageId as string;
      return {
        ...state,
        chatMessages: state.chatMessages.map((m) => (m.id === mid ? { ...m, body: '', deleted: true } : m)),
      };
    }

    case 'searching':
      return { ...state, phase: 'searching', isQuickMatch: true, opponentForfeit: false };
    case 'profile':
      return { ...state, profile: action.profile };
    case 'level_reward_claimed':
      return {
        ...state,
        profile: action.profile,
        lastClaim: {
          level: action.level, diamonds: action.diamonds,
          emoteId: action.emoteId, frameTier: action.frameTier,
          powerId: action.powerId ?? null,
          track: action.track ?? 'free',
          seq: (state.lastClaim?.seq ?? 0) + 1,
        },
      };
    case 'power_used':
      // Jeton düştü / kalkan kuşanıldı — sunucunun döndürdüğü taze profil geçerli
      return { ...state, profile: action.profile };
    case 'power_purchased':
      // Mağazadan güç alındı — elmas düştü, envanter arttı
      return { ...state, profile: action.profile, lastPurchase: { kind: 'power', id: (action as any).powerId, seq: (state.lastPurchase?.seq ?? 0) + 1 } };
    case 'premium_road_purchased':
      // Elmasla ya da ₺ IAP ile — iki yol da bu mesajı düşürür, tek onay yeter
      return { ...state, profile: action.profile, lastPurchase: { kind: 'premiumRoad', id: undefined, seq: (state.lastPurchase?.seq ?? 0) + 1 } };
    case 'my_stats':
      return { ...state, myStats: { winStreak: action.winStreak, bestStreak: action.bestStreak, modes: action.modes } };
    case 'name_changed':
      return { ...state, profile: action.profile };
    case 'xp_update': {
      // Profili yerinde güncelle: yalnız xp/seviye — ödüller artık Seviye
      // Yolu'ndan TOPLANIR (claim_level_reward), burada verilmez.
      const profile = state.profile
        ? { ...state.profile, xp: action.xp, level: action.level }
        : state.profile;
      // Maç ekranından çıkmadan (rövanşlarla) üst üste oynanan maçların kazanımı
      // BİRİKİR: xp/level sunucunun son durumu, gained ve leveledUp ise yağmur
      // (_xp_seen) tüketene dek toplanır — çıkışta TOPLAM XP çubuğa akar,
      // seviye popup'ı da oturumda atlanan tüm seviyelerin ödüllerini gösterir.
      const prev = state.xpGain;
      return {
        ...state,
        profile,
        xpGain: {
          xp: action.xp,
          level: action.level,
          xpForNext: action.xpForNext,
          gained: (prev?.gained ?? 0) + action.gained,
          leveledUp: [...(prev?.leveledUp ?? []), ...action.leveledUp],
          boosted: (prev?.boosted ?? false) || action.boosted,
        },
      };
    }
    case 'trophy_update':
      return {
        ...state,
        trophyDelta: { trophies: action.trophies, delta: action.delta, arena: action.arena, arenaReward: (action as any).arenaReward, shielded: action.shielded },
        profile: state.profile
          ? {
              ...state.profile,
              trophies: action.trophies,
              arena: action.arena,
              diamonds: typeof (action as any).diamonds === 'number' ? (action as any).diamonds : state.profile.diamonds,
              winStreak: typeof action.winStreak === 'number' ? action.winStreak : state.profile.winStreak,
              bestStreak: typeof action.bestStreak === 'number' ? action.bestStreak : state.profile.bestStreak,
              // Kırılan seri maç sonrası 0'a döner (yalnız kırıldığı maçtan sonra geri yüklenebilir).
              lostStreak: typeof action.lostStreak === 'number' ? action.lostStreak : state.profile.lostStreak,
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
      return { ...state, profile: action.profile, lastPurchase: { kind: 'emote', id: (action as any).emoteId, seq: (state.lastPurchase?.seq ?? 0) + 1 } };
    case 'avatar_purchased':
      return { ...state, profile: action.profile, lastPurchase: { kind: 'avatar', id: (action as any).avatarId, seq: (state.lastPurchase?.seq ?? 0) + 1 } };
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
        // Lobiden dolan oda = elle kurulan özel oda → ev sahibi otomatik başlatır.
        matchupAutoStart: roomFull && !hasBot && state.phase === 'lobby' ? true : state.matchupAutoStart,
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
  lastClaim: null,
        matchupAutoStart: false,
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
      return { ...state, phase: 'pick', picked: false, pickEndsAt: action.endsAt, pickRole: (action as any).pickRole ?? 'team', usedClubIds: (action as any).usedClubIds ?? [], usedCountries: (action as any).usedCountries ?? [], teams: null, locked: null, passedBy: [], result: null, clubResults: [] };
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
      // Silent rate-limit feedback; just ignore the burst instead of flashing red UI.
      if (/çok hızlı|cok hizli|rate limit/i.test(action.message ?? '')) return state;
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
  const connectKind = useRef(''); // first-message type of the in-flight connect ('register'/'resume_room'/…)
  const lastSocketActivity = useRef(0);
  // Ordered QUEUES (not single slots): rapid sends during a reconnect used to
  // overwrite each other — only the last message survived, the rest silently
  // vanished ("üst üste gönder basınca göndermiyor"). Flushed in order on auth.
  const pendingAfterAuth = useRef<ClientMsg[]>([]);
  const pendingAfterResume = useRef<ClientMsg[]>([]);
  const offlineRoomRef = useRef<OfflineRoom | null>(null);
  // Maç ortasında çıkışta (forfeit) kaybetme popup'ı için: reset SONRASI gelen
  // kupa cezasını bu bağlamla eşleştir (yalnız dereceli, gerçek-rakipli maçta set).
  const forfeitCtxRef = useRef<{ youScore: number; oppScore: number; opponentName: string } | null>(null);
  const friendOpRef = useRef(0); // son arkadaş işleminin zamanı — sonraki sunucu 'error'ını Arkadaşlar ekranına yönlendirmek için
  const lastUserIdRef = useRef<string | null>(null);
  const lastAuthProviderRef = useRef<'apple' | 'google' | 'facebook' | null>(null);
  // Index into SERVER_URLS to try FIRST — seeded from whichever endpoint last
  // connected on this device, so a network that blocks one host pays the
  // discovery cost once instead of on every launch.
  const preferredEndpoint = useRef(0);

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
          dispatch({ type: '_authProvider', provider });
        }
      })
      .catch(() => {});
    AsyncStorage.getItem(ENDPOINT_KEY)
      .then((url) => {
        const i = url ? SERVER_URLS.indexOf(url) : -1;
        if (i >= 0) { preferredEndpoint.current = i; setActiveServerUrl(url!); }
      })
      .catch(() => {});
  }, []);

  // ELLE kurulan özel oda MATCHUP'ta asılı kalmasın (lobideki Başlat butonuna
  // matchup geçişi yüzünden artık ulaşılamıyor): lobiden dolan odada EV SAHİBİ,
  // eşleşme gösteriminden ~3sn sonra maçı otomatik başlatır. Hızlı eşleşme ve
  // davet odalarını sunucu başlattığı için bu bayrak onlarda hiç kalkmaz —
  // sunucunun kendi start'ıyla yarışıp "Game already in progress" üretmez.
  useEffect(() => {
    if (state.phase !== 'matchup' || !state.matchupAutoStart) return;
    const you = state.room?.players.find((p) => p.id === state.room?.youId);
    if (!you?.isHost) return;
    const tm = setTimeout(() => send({ type: 'start' }), 3000);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.matchupAutoStart, state.room]);

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

  // Pending Apple IAP verifications — FIFO queue, resolved oldest-first when the
  // server confirms each grant (diamonds_granted) or rejected on error, so we only
  // finishTransaction once paid. A queue (not one slot): the connect-time replay
  // of unfinished transactions can overlap a live purchase's verify.
  const pendingVerify = useRef<Array<{ resolve: () => void; reject: (e: Error) => void }>>([]);
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
    connectingSince.current = Date.now();
    connectKind.current = (first as { type?: string }).type ?? '';

    // Walk the endpoint list until one comes up. A host that a network BLOCKS
    // (enterprise DNS/proxy filtering — how App Review saw every login "fail")
    // never errors: the socket sits in CONNECTING forever, neither onopen nor
    // onerror fires. So each candidate gets its own deadline, and only when the
    // whole list is exhausted do we tell the user we couldn't connect.
    const attempt = (step: number) => {
      if (step >= SERVER_URLS.length) {
        wsRef.current = null;
        connectingSince.current = 0;
        dispatch({ type: '_connected', value: false });
        if (!opts?.silent) dispatch({ type: 'error', message: t('error.connect') });
        return;
      }
      const url = SERVER_URLS[(preferredEndpoint.current + step) % SERVER_URLS.length]!;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      let opened = false;  // the handshake completed on THIS socket
      let settled = false; // this attempt has been decided (opened, or moved on)
      let timer: ReturnType<typeof setTimeout> | null = null;
      const clearWatchdog = () => { if (timer) { clearTimeout(timer); timer = null; } };
      // Give up on this host and try the next one — silently: a fallback that
      // works must never flash a connection error at the user.
      const nextHost = () => {
        if (settled) return;
        settled = true;
        clearWatchdog();
        try { ws.onopen = null; ws.onmessage = null; ws.onclose = null; ws.onerror = null; ws.close(); } catch { /* ignore */ }
        if (wsRef.current !== ws) return; // superseded by a newer connect — drop this chain
        wsRef.current = null;
        attempt(step + 1);
      };
      timer = setTimeout(nextHost, CONNECT_TIMEOUT_MS);
      ws.onopen = () => {
        opened = true;
        settled = true;
        clearWatchdog();
        if (wsRef.current !== ws) return; // superseded by a newer socket
        connectingSince.current = 0;
        lastSocketActivity.current = Date.now();
        // Remember which host this network actually allows: every later connect
        // (and every REST call) starts there instead of re-walking the list.
        preferredEndpoint.current = SERVER_URLS.indexOf(url);
        setActiveServerUrl(url);
        AsyncStorage.setItem(ENDPOINT_KEY, url).catch(() => {});
        dispatch({ type: '_connected', value: true });
        ws.send(JSON.stringify(first));
      };
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(String(e.data)) as ServerMsg;
          lastSocketActivity.current = Date.now();
          // Arkadaş işleminden hemen sonra gelen sunucu 'error'ı (zaten arkadaşsınız,
          // kullanıcı bulunamadı vb.) ana oyun ekranında DEĞİL, yalnız Arkadaşlar
          // ekranında görünsün diye friendNotice'a yönlendirilir.
          if (m.type === 'error' && Date.now() - friendOpRef.current < 6000) {
            friendOpRef.current = 0;
            dispatch({ type: '_friend_notice', text: (m as { message: string }).message, kind: 'error' } as any);
          } else {
            dispatch(m);
          }
          const mt = (m as { type?: string }).type;
          if (mt === 'account_deleted') {
            // Server confirmed permanent deletion — wipe ALL local identity so the
            // account can't be auto-restored, tear the socket down, back to login.
            AsyncStorage.multiRemove([PROFILE_KEY, LAST_USER_ID_KEY, LAST_AUTH_PROVIDER_KEY]).catch(() => {});
            lastUserIdRef.current = null;
            prevProfile.current = null;
            pendingAfterAuth.current = [];
            pendingAfterResume.current = [];
            if (offlineRoomRef.current) { try { offlineRoomRef.current.leave(); } catch { /* ignore */ } offlineRoomRef.current = null; }
            try { ws.onopen = null; ws.onmessage = null; ws.onclose = null; ws.onerror = null; ws.close(); } catch { /* ignore */ }
            if (wsRef.current === ws) wsRef.current = null;
            dispatch({ type: '_logout' });
            return;
          }
          // The login screen states that continuing accepts the Terms, so record
        // that agreement the moment a session is established (guideline 1.2).
        // The server only writes it once, so re-sending on reconnect is a no-op.
        if (mt === 'profile' && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'accept_terms' }));
        }
        if (mt === 'profile' && pendingAfterAuth.current.length && ws.readyState === WebSocket.OPEN) {
            const queue = pendingAfterAuth.current;
            pendingAfterAuth.current = [];
            for (const pending of queue) ws.send(JSON.stringify(pending));
          }
          if (mt === 'room_state' && pendingAfterResume.current.length && ws.readyState === WebSocket.OPEN) {
            const queue = pendingAfterResume.current;
            pendingAfterResume.current = [];
            for (const pending of queue) ws.send(JSON.stringify(pending));
          }
          // Resolve the OLDEST pending IAP verification (FIFO — a concurrent verify
          // used to clobber the single slot and orphan the first promise, leaving
          // the "processing securely" overlay up forever). Generic 'error' frames
          // are deliberately NOT consumed here: the server emits them from dozens
          // of unrelated paths, and settling a verify on one desynced the FIFO —
          // stray verifies settle via their own 20s timeout instead.
          if (mt === 'diamonds_granted') { pendingVerify.current.shift()?.resolve(); }
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
        // Closed WITHOUT ever opening → this endpoint is unusable on this
        // network; move to the next one instead of reporting a failure.
        if (!opened) { nextHost(); return; }
        clearWatchdog();
        if (wsRef.current !== ws) return; // an old, superseded socket closing — ignore
        connectingSince.current = 0;
        dispatch({ type: '_connected', value: false });
      };
      // An error BEFORE the handshake means only this endpoint failed — fall
      // through to the next. Once open, keep the old behaviour: background
      // keepalive reconnects stay silent, user-triggered ones surface the error.
      ws.onerror = () => {
        if (!opened) { nextHost(); return; }
        clearWatchdog();
        if (!opts?.silent) dispatch({ type: 'error', message: t('error.connect') });
      };
    };
    attempt(0);
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
        pendingAfterAuth.current.push(msg);
        // A REGISTER reconnect is already in flight → the queued message will
        // flush on 'profile'. (Kind check matters: a find_match/join connect
        // never emits 'profile', so trusting any CONNECTING socket stranded the
        // queue.) Re-entering connectAndSend tore the socket down on every rapid
        // tap (socket thrash), losing all queued sends.
        const cur = wsRef.current;
        if (cur && cur.readyState === WebSocket.CONNECTING && connectKind.current === 'register' && connectingSince.current > 0 && Date.now() - connectingSince.current < 8000) return;
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
        pendingAfterResume.current.push(msg);
        // Same in-flight guard as the auth path: while a RESUME connect is mid-
        // handshake, rapid in-match sends (guess/emote taps) must only queue —
        // re-entering connectAndSend restarted the handshake on every tap.
        const cur = wsRef.current;
        if (!(cur && cur.readyState === WebSocket.CONNECTING && connectKind.current === 'resume_room' && connectingSince.current > 0 && Date.now() - connectingSince.current < 8000)) {
          connectAndSend({ type: 'resume_room', code: state.room.code, userId: state.profile.userId }, { silent: true });
          track('room_resume_attempt', { phase: state.phase });
        }
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

  // Leagues/countries/nationalities for the scope picker. Load INSTANTLY from the
  // on-device cache first (works offline, no launch-time network wait), then
  // refresh from the backend in the background and re-cache. So it's fetched at
  // most once per launch to refresh — never blocking, and available immediately
  // from the phone's storage after the very first successful load.
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(SCOPES_KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        try { dispatch({ type: '_scopes', scopes: JSON.parse(raw) as ScopesList }); } catch { /* stale/corrupt cache — ignore */ }
      })
      .catch(() => {});
    fetchApi('/config')
      .then((r) => r.json())
      .then((cfg: { maintenance?: boolean; minIosBuild?: number }) => {
        if (!alive) return;
        if (cfg.maintenance) dispatch({ type: 'error', message: 'Bakım modundayız, birazdan tekrar dene' });
        if (typeof cfg.minIosBuild === 'number' && APP_BUILD_NUMBER < cfg.minIosBuild) {
          // Hard gate (was a transient toast): App.tsx swaps the whole tree for
          // the update screen — nothing is playable until the store update.
          dispatch({ type: '_update_required' });
        }
      })
      .catch(() => {});
    fetchApi('/scopes')
      .then((r) => r.json())
      .then((s: ScopesList) => {
        if (!alive) return;
        dispatch({ type: '_scopes', scopes: s });
        AsyncStorage.setItem(SCOPES_KEY, JSON.stringify(s)).catch(() => {}); // cache for the next launch
      })
      .catch(() => {}); // offline / server down → the cached scopes above stay in effect
    return () => {
      alive = false;
    };
  }, []);

  // A pending friendly-match invite must not outlive the sender's next move.
  // The old full-screen waiting modal made this impossible by blocking; the
  // non-blocking banner lets the sender start a bot/quick match or invite
  // someone else — without this, the OLD invite stays alive server-side and the
  // first friend's accept would yank the sender out of whatever they entered.
  const dropPendingInvite = () => {
    const inv = state.outgoingInvite;
    if (!inv) return;
    send({ type: 'cancel_match_invite', toId: inv.toId });
    dispatch({ type: '_set_outgoing', invite: null });
  };

  const actions = {
    // Send an Apple IAP receipt to the server for validation; resolves when the
    // server confirms diamonds were granted (diamonds_granted), rejects otherwise.
    verifyPurchase: (receipt: string) => new Promise<void>((resolve, reject) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) { reject(new Error('disconnected')); return; }
      // Settle via THIS entry, never a shared slot: the timeout always rejects
      // this promise if it's still queued, so it can never be orphaned (which
      // used to leave the purchase overlay stuck on "processing securely").
      const entry = { resolve, reject };
      pendingVerify.current.push(entry);
      ws.send(JSON.stringify({ type: 'verify_purchase', receipt }));
      setTimeout(() => {
        const idx = pendingVerify.current.indexOf(entry);
        if (idx >= 0) { pendingVerify.current.splice(idx, 1); reject(new Error('timeout')); }
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
      fetchApi('/leaderboard')
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
    guestLogin: () => {
      // Taze misafir hesap: eski sosyal girişin sağlayıcı izi diskte kalmasın —
      // yoksa misafir hesap yanlışlıkla "sosyal" sanılıp ad değiştirme görür.
      // (lastAuthProviderRef null kalır; misafir → sosyal yükseltme bağlama
      // mantığı `!ref.current` yolundan aynen çalışmaya devam eder.)
      lastAuthProviderRef.current = null;
      AsyncStorage.removeItem(LAST_AUTH_PROVIDER_KEY).catch(() => {});
      dispatch({ type: '_authProvider', provider: null });
      connectAndSend({ type: 'guest' });
    },
    // Sign in with Apple / Google / Facebook: send the provider's identity token
    // to the server, which verifies it and returns the account profile.
    authWith: (provider: 'apple' | 'google' | 'facebook', token: string, name?: string) => {
      const canReuseLastUser = !lastAuthProviderRef.current || lastAuthProviderRef.current === provider;
      const userId = canReuseLastUser ? (state.profile?.userId ?? lastUserIdRef.current ?? undefined) : undefined;
      lastAuthProviderRef.current = provider;
      AsyncStorage.setItem(LAST_AUTH_PROVIDER_KEY, provider).catch(() => {});
      dispatch({ type: '_authProvider', provider });
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        send({ type: 'auth', provider, token, name, userId });
      } else {
        connectAndSend({ type: 'auth', provider, token, name, userId });
      }
    },
    changeName: (newName: string) => send({ type: 'change_name', newName }),
    // XP yağmuru tamamlandı — bir daha (profil gezintisi dahil) asla tekrarlamaz
    markXpSeen: () => dispatch({ type: '_xp_seen' }),
    setUsername: (username: string) => {
      const userId = state.profile?.userId;
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        send({ type: 'set_username', username, userId });
      } else {
        connectAndSend({ type: 'set_username', username, userId });
      }
    },
    findMatch: (options?: GameOptions) => {
      dropPendingInvite();
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
    createRoom: (name: string, options?: GameOptions) => {
      dropPendingInvite();
      connectAndSend({ type: 'create_room', name, userId: state.profile?.userId, options });
    },
    createSolo: (name: string, options?: GameOptions) => {
      dropPendingInvite();
      const mode = options?.mode ?? 'team-team';
      track('solo_create', { difficulty: options?.difficulty ?? 'medium', mode });
      // KALICI ÇÖZÜM — mod ve logo bozulmasını KÖKTEN bitirir.
      // Bot maçları ARTIK HER ZAMAN sunucuya gider. Sebep: çevrimdışı oda yalnız
      // takım-takım oynatabiliyor ve kulüp logoları sunucudan geldiği için gösteremiyordu.
      // NetInfo simülatörde/bazı ağlarda internet olmasına rağmen yanlış "offline"
      // döndürüp maçı çevrimdışı odaya atıyor, böylece ülke-takım SESSİZCE takım-takıma
      // düşüyor ve logolar beyaz bayrak oluyordu. Artık NetInfo'ya hiç güvenmiyoruz:
      // connectAndSend zaten sağlam bir yeniden-bağlanma/kurtarma mantığına sahip;
      // gerçekten internet yoksa dürüst bir "bağlantı hatası" gösterir (sessizce yanlış
      // modda/logosuz oynatmaz). Böylece "ülke-takım seçince takım-takım oluyor" ve
      // "logo yerine beyaz bayrak" hataları bir daha ASLA yaşanmaz.
      connectAndSend({ type: 'create_solo', name, userId: state.profile?.userId, options });
    },
    joinRoom: (code: string, name: string) => {
      dropPendingInvite();
      connectAndSend({ type: 'join_room', code: code.toUpperCase(), name, userId: state.profile?.userId });
    },
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
    setFrame: (frameId: string | null) => send({ type: 'set_frame', frameId }),
    claimLevelReward: (level: number, track: 'free' | 'premium' = 'free') => send({ type: 'claim_level_reward', level, track }),
    buyPremiumRoad: () => send({ type: 'buy_premium_road' }),
    buyPower: (powerId: 'xp2x' | 'shield' | 'streak' | 'training' | 'socialtoken') => send({ type: 'buy_power', powerId }),
    usePower: (powerId: 'xp2x' | 'shield' | 'streak' | 'training' | 'socialtoken') => send({ type: 'use_power', powerId }),
    loadMyStats: () => send({ type: 'get_my_stats' }),
    // Friends — via WebSocket for real-time notifications.
    loadFriends: () => send({ type: 'list_friends' }),
    sendFriendRequest: (targetCode?: string, targetUsername?: string) => {
      friendOpRef.current = Date.now();
      send({ type: 'send_friend_request', targetCode, targetUsername });
    },
    respondFriendRequest: (requestId: string, accept: boolean) => {
      friendOpRef.current = Date.now();
      send({ type: 'respond_friend_request', requestId, accept });
    },
    removeFriend: (friendId: string) => send({ type: 'remove_friend', friendId }),
    searchUsers: (query: string) => send({ type: 'search_users', query }),
    inviteFriendMatch: (friendId: string, friendName: string, options?: GameOptions) => {
      friendOpRef.current = Date.now();
      // Re-inviting the SAME friend just replaces (server does too); a pending
      // invite to a DIFFERENT friend is cancelled so it can't ghost-accept.
      const prev = state.outgoingInvite;
      if (prev && prev.toId !== friendId) send({ type: 'cancel_match_invite', toId: prev.toId });
      send({ type: 'invite_friend_match', friendId, options });
      dispatch({ type: '_set_outgoing', invite: { toId: friendId, toName: friendName, expiresAt: Date.now() + 30_000 } });
    },
    cancelMatchInvite: (toId: string) => {
      send({ type: 'cancel_match_invite', toId });
      dispatch({ type: '_set_outgoing', invite: null });
    },
    respondMatchInvite: (fromId: string, accept: boolean) => {
      // Accepting someone ELSE's invite starts a match — our own pending invite
      // must be voided first or the third friend keeps a ghost invite.
      if (accept) dropPendingInvite();
      send({ type: 'respond_match_invite', fromId, accept });
      dispatch({ type: '_dismiss_invite' });
    },
    getUserProfile: (userId: string) => send({ type: 'get_user_profile', userId }),
    closeUserProfile: () => dispatch({ type: '_close_profile' }),
    clearNotice: () => dispatch({ type: '_clear_notice' }),
    clearFriendNotice: () => dispatch({ type: '_clear_friend_notice' } as any),
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
      const b = body.trim();
      if (!b) return;
      // Optimistic local echo: the bubble appears the instant Send is pressed
      // instead of after the server round-trip (whose delay/drop read as "Send
      // doesn't work"). Reuses the message_received reducer (chat + conversation
      // list both update); reconciled there when the real echo lands.
      if (state.profile) {
        const local: MessageView = {
          id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          fromId: state.profile.userId,
          fromName: state.profile.displayName ?? '',
          toId: toUserId,
          body: b,
          createdAt: new Date().toISOString(),
        };
        dispatch({ type: 'message_received', message: local } as any);
      }
      send({ type: 'send_message', toUserId, body: b });
    },
    markRead: (fromUserId: string) => send({ type: 'mark_read', fromUserId }),
    // ---- User-generated-content safety (App Store guideline 1.2) ----
    blockUser: (userId: string) => send({ type: 'block_user', userId }),
    unblockUser: (userId: string) => send({ type: 'unblock_user', userId }),
    listBlocked: () => send({ type: 'list_blocked' }),
    // messageId omitted → reports the user rather than one specific message.
    reportContent: (userId: string, reason: string, messageId?: string) =>
      send({ type: 'report_content', userId, reason, messageId }),
    deleteMessage: (messageId: string) => send({ type: 'delete_message', messageId }),
    acceptTerms: () => send({ type: 'accept_terms' }),
    // ---- Push notifications ----
    // Ask permission → fetch the Expo push token → register it with the server.
    // NOT auto-run — the UI triggers it (permission prompt / silent re-register
    // on later launches when permission is already granted). Every step is
    // guarded: in Expo Go the token is null and this quietly does nothing.
    registerPush: async () => {
      try {
        const granted = await requestPushPermission();
        if (!granted) return;
        const token = await getPushToken();
        if (!token) return;
        const platform = Platform.OS === 'android' ? ('android' as const) : ('ios' as const);
        // send() so reconnect queueing applies (register → queued msg after auth).
        send({ type: 'register_push', token, platform, lang: currentLang() });
      } catch (err) {
        captureError(err, { where: 'register_push' });
      }
    },
    typingStart: (toUserId: string) => send({ type: 'typing_start', toUserId }),
    typingStop: (toUserId: string) => send({ type: 'typing_stop', toUserId }),
    leave: () => {
      if (offlineRoomRef.current) {
        offlineRoomRef.current.leave();
        offlineRoomRef.current = null;
      }
      // Maç ortasında dereceli maçtan çıkış = FORFEIT (kaybetme). Kupa cezası
      // (trophy_update) reset SONRASI gelir; onu yakalayıp kaybetme popup'ı göster.
      // Yalnız: hızlı eşleşme + maç bitmemiş + rakip zaten ayrılmamış + GERÇEK rakip.
      {
        const fRoom = state.room;
        const fOpp = fRoom?.players.find((p) => p.id !== fRoom.youId);
        const fYou = fRoom?.players.find((p) => p.id === fRoom.youId);
        const isRankedForfeit = state.isQuickMatch && !state.matchOver && !state.opponentForfeit && !!fOpp && !(fOpp.name || '').includes('Bot');
        forfeitCtxRef.current = isRankedForfeit ? { youScore: fYou?.score ?? 0, oppScore: fOpp?.score ?? 0, opponentName: fOpp?.name ?? '' } : null;
      }
      // Deliberate exit: tell the server BEFORE closing — a bare socket close
      // gets the 12s reconnect grace and the opponent would keep playing
      // against nobody ("anlık multiplayer bu").
      send({ type: 'leave_match' } as any);
      // Soketi hemen DEĞİL kısa gecikmeyle kapat: sunucu çekilme cezasını
      // (trophy_update, delta<0) bu pencerede yollar — ana menüde kupa düşüş
      // animasyonu bu mesajla oynar. State yine ANINDA sıfırlanır.
      //
      // EMEKLİLİK ŞART (donma düzeltmesi): eski soketin onmessage'ı guard'sız
      // dispatch ediyor — pencere boyunca gelen bayat room_state/opponent_left
      // _reset SONRASI state'i maç fazına geri fırlatıp uygulamayı sürücüsüz
      // bir ekranda donduruyordu. Emekli sokette YALNIZ trophy_update/xp_update
      // geçer; onclose/onerror da sökülür (yeni bağlantıya hayalet düşmesin).
      const wsToClose = wsRef.current;
      wsRef.current = null;
      if (wsToClose) {
        wsToClose.onopen = null; wsToClose.onerror = null; wsToClose.onclose = null;
        wsToClose.onmessage = (e) => {
          try {
            const m = JSON.parse(String(e.data)) as ServerMsg;
            const mt = (m as { type?: string }).type;
            if (mt === 'trophy_update' || mt === 'xp_update') dispatch(m);
            // Forfeit kupa cezası geldi → kaybetme popup'ını bu delta ile göster.
            if (mt === 'trophy_update' && forfeitCtxRef.current) {
              const tu = m as ServerMsg & { type: 'trophy_update' };
              dispatch({ type: '_forfeit_loss', delta: tu.delta, trophies: tu.trophies, arena: tu.arena, ...forfeitCtxRef.current });
              forfeitCtxRef.current = null;
            }
          } catch { /* yut */ }
        };
        setTimeout(() => { try { wsToClose.onmessage = null; wsToClose.close(); } catch { /* kapalı */ } }, 1200);
      }
      dispatch({ type: '_reset' });
    },
    clearForfeitLoss: () => dispatch({ type: '_clear_forfeit_loss' }),
    // ANTI-CHEAT: the app went to the BACKGROUND mid-match — "başka uygulamaya
    // girip cevaba bakıyor". Same exit as leave() (socket close = forfeit for
    // the opponent), plus a toast so the player knows exactly why they lost.
    forfeitFromBackground: () => {
      if (offlineRoomRef.current) {
        offlineRoomRef.current.leave();
        offlineRoomRef.current = null;
      }
      send({ type: 'leave_match' } as any); // rakip ANINDA görsün (grace yok)
      wsRef.current?.close();
      wsRef.current = null;
      dispatch({ type: '_reset' });
      dispatch({ type: 'error', message: t('match.leftBackground') } as any);
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
      pendingVerify.current = [];
      pendingAdReward.current = null;
      // Never let account A's queued sends flush under account B's session.
      pendingAfterAuth.current = [];
      pendingAfterResume.current = [];
      lastUserIdRef.current = lastUserId ?? null;
      try {
        if (lastUserId) await AsyncStorage.setItem(LAST_USER_ID_KEY, lastUserId);
        await AsyncStorage.removeItem(PROFILE_KEY);
      } catch {
        // Even if storage removal fails, still force the UI back to login.
      }
      dispatch({ type: '_logout' });
    },
    deleteAccount: () => send({ type: 'delete_account' }),
  };

  return { state, actions };
}
