import { createServer, type Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { RoomManager } from '../rooms/manager.ts';
import { BotPlayer } from '../rooms/bot.ts';
import { listScopes, listNationalities } from '../game/verify.ts';
import {
  findOrCreateUser, findOrCreateUserByProvider, createGuestUser, getUser, changeDisplayName,
  grantDevEmotesIfNeeded,
  setUsername, buyEmote, setEquippedEmotes, setAvatar, setSelectedFrame, buyAvatar, touchLastSeen, getLeaderboard, grantAdReward, usePower, getModeStats, buyPremiumRoad, buyPower,
  listFriends, listFriendRequests, sendFriendRequest, respondFriendRequest,
  removeFriend, searchUsers, getMatchHistory, deleteAccount,
  type UserProfile,
} from '../game/rank.ts';
import { verifyAppleToken, verifyGoogleToken, verifyFacebookToken } from '../game/auth.ts';
import { claimLevelReward } from '../game/level.ts';
import { censorMessage } from '../game/username.ts';
import {
  blockUser, unblockUser, listBlocked, isBlockedBetween, reportContent, deleteOwnMessage, acceptTerms,
  isIdentifiedAccount,
} from '../game/moderation.ts';

// Guideline 1.2: no anonymous posting. Any path that creates content another
// user sees requires a verified Apple/Google/Facebook identity — a guest can
// play everything, but cannot message or add friends.
const GUEST_BLOCKED_MSG = 'Mesajlaşmak için Apple veya Google ile giriş yap';
import { verifyApplePurchase } from '../game/iap.ts';
import { registerPushToken, sendPushToUsers, startPushCrons } from '../game/push.ts';
import { pool } from '../db/pool.ts';
import { log } from '../logger.ts';
import { config } from '../config.ts';
import type { Room, Transport } from '../rooms/room.ts';
import type { MessageView, ConversationView } from '../protocol.ts';
import type { ClientMsg, GameMode, ProfileView, ServerMsg } from '../protocol.ts';

interface ConnCtx {
  room: Room;
  playerId: string;
  userProfile?: UserProfile;
}

/** Build a ProfileView from a UserProfile (used in all profile-sending paths). */
function toProfileView(p: UserProfile): ProfileView {
  return {
    userId: p.id,
    displayName: p.displayName,
    trophies: p.trophies,
    diamonds: p.diamonds,
    wins: p.wins,
    losses: p.losses,
    selectedAvatar: p.selectedAvatar,
    ownedAvatars: p.ownedAvatars,
    ownedEmotes: p.ownedEmotes,
    equippedEmotes: p.equippedEmotes,
    usernameSet: p.usernameSet,
    socialPackUntil: p.socialPackUntil,
    arena: p.arena,
    avatar: p.avatar,
    xp: p.xp,
    level: p.level,
    selectedFrame: p.selectedFrame,
    claimedLevels: p.claimedLevels,
    powerXp2x: p.powerXp2x,
    powerShield: p.powerShield,
    xpBoostUntil: p.xpBoostUntil,
    shieldArmed: p.shieldArmed,
    winStreak: p.winStreak,
    bestStreak: p.bestStreak,
    powerStreak: p.powerStreak,
    lostStreak: p.lostStreak,
    powerTraining: p.powerTraining,
    trainingBoostUntil: p.trainingBoostUntil,
    powerSocialToken: p.powerSocialToken,
    premiumRoad: p.premiumRoad,
    claimedPremium: p.claimedPremium,
    ownedFrames: p.ownedFrames,
  };
}

function wsTransport(ws: WebSocket): Transport {
  return {
    isBot: false,
    send: (msg: ServerMsg) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    },
  };
}

interface QueueEntry {
  transport: Transport;
  ws: WebSocket;
  name: string;
  userId?: string;
  userProfile?: UserProfile;
  options?: import('../protocol.ts').GameOptions;
  setCtx: (c: ConnCtx) => void;
}

const SOCIAL_PACK_REQUIRED = 'Bu mod için iki oyuncuda da Sosyal Paket aktif olmalı';
const RATE_WINDOW_MS = 10_000;
const RATE_MAX_MESSAGES = 90;
const RATE_MAX_TYPING = 120; // separate lane: exempt-from-main-cap typing still can't flood
// Ranked pairing: match on trophy proximity, NOT arena identity — two players a
// couple of matches apart (e.g. 500 vs 450) must pair even across an arena border.
const MATCH_TROPHY_RANGE = 100;

function remoteIp(req: import('node:http').IncomingMessage): string {
  return String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'unknown').split(',')[0]!.trim();
}

function isSocialPackMode(mode: GameMode | undefined): boolean {
  return mode === 'country-team' || mode === 'letter-team';
}

function hasActiveSocialPack(profile: UserProfile | undefined): boolean {
  return Boolean(profile?.socialPackUntil && new Date(profile.socialPackUntil).getTime() > Date.now());
}

function canUseMode(profile: UserProfile | undefined, mode: GameMode | undefined): boolean {
  return !isSocialPackMode(mode) || hasActiveSocialPack(profile);
}

// A friend match invite awaiting the invitee's response. Holds the inviter's
// connection bits so we can drop both players into a shared room on accept.
interface PendingInvite {
  fromUserId: string;
  toUserId: string;
  fromName: string;
  transport: Transport;
  ws: WebSocket;
  userProfile?: UserProfile;
  options?: import('../protocol.ts').GameOptions;
  setCtx: (c: ConnCtx) => void;
  timer: ReturnType<typeof setTimeout>;
}

// Track online users for real-time friend notifications.
const onlineUsers = new Map<string, Set<WebSocket>>(); // userId → all open sockets

function addOnline(userId: string, ws: WebSocket): void {
  let set = onlineUsers.get(userId);
  if (!set) { set = new Set(); onlineUsers.set(userId, set); }
  set.add(ws);
  void touchLastSeen(userId);
}
function removeOnline(userId: string, ws: WebSocket): void {
  void touchLastSeen(userId);
  const set = onlineUsers.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) onlineUsers.delete(userId);
}

function sendToUser(userId: string, msg: ServerMsg): void {
  const set = onlineUsers.get(userId);
  if (!set) return;
  const data = JSON.stringify(msg);
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) ws.send(data);
  }
}

async function ensureProfileLoaded(
  current: UserProfile | undefined,
  userId: string | undefined,
  ws: WebSocket,
): Promise<UserProfile | undefined> {
  if (current || !userId) return current;
  const profile = await getUser(userId).catch(() => null);
  if (!profile) return current;
  addOnline(profile.id, ws);
  return profile;
}

/** Build a friends_list message with online status. */
async function getFriendsData(userId: string): Promise<ServerMsg & { type: 'friends_list' }> {
  const [rawFriends, requests] = await Promise.all([
    listFriends(userId),
    listFriendRequests(userId),
  ]);
  const friends = rawFriends.map((f) => ({
    ...f,
    online: onlineUsers.has(f.userId),
  }));
  return { type: 'friends_list', friends, requests };
}

export function startServer(port: number): Server {
  const manager = new RoomManager();
  startPushCrons();
  const matchQueue: QueueEntry[] = [];
  const pendingInvites = new Map<string, PendingInvite>(); // `${fromUserId}:${toUserId}`
  const http = createServer((req, res) => {
    const cors = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
    if (req.url === '/health') {
      res.writeHead(200, cors);
      res.end(JSON.stringify({ ok: true, rooms: manager.count }));
      return;
    }
    if (req.url === '/config') {
      res.writeHead(200, cors);
      res.end(JSON.stringify({
        maintenance: config.maintenanceMode,
        minIosBuild: config.minIosBuild,
        minAndroidVersionCode: config.minAndroidVersionCode,
      }));
      return;
    }
    if (req.url === '/scopes') {
      Promise.all([listScopes(), listNationalities()])
        .then(([scopes, nationalities]) => {
          res.writeHead(200, cors);
          res.end(JSON.stringify({ ...scopes, nationalities }));
        })
        .catch(() => {
          res.writeHead(500, cors);
          res.end(JSON.stringify({ leagues: [], countries: [], nationalities: [] }));
        });
      return;
    }
    if (req.url === '/leaderboard') {
      getLeaderboard(50)
        .then((lb) => {
          res.writeHead(200, cors);
          res.end(JSON.stringify(lb));
        })
        .catch(() => {
          res.writeHead(500, cors);
          res.end(JSON.stringify([]));
        });
      return;
    }
    // ---- Friends (over HTTP — no persistent socket on the Friends screen) ----
    const path = (req.url ?? '').split('?')[0];
    const query = new URLSearchParams((req.url ?? '').split('?')[1] ?? '');

    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...cors, 'access-control-allow-methods': 'GET,POST', 'access-control-allow-headers': 'content-type' });
      res.end();
      return;
    }

    // Friends are now managed over WebSocket (send_friend_request, list_friends, etc.)
    if (path === '/friends' || path === '/friends/add' || path === '/friends/remove') {
      res.writeHead(200, cors);
      res.end(JSON.stringify({ friends: [] }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ server: http });

  wss.on('connection', (ws: WebSocket, req) => {
    let ctx: ConnCtx | null = null;
    let userProfile: UserProfile | undefined;
    const transport = wsTransport(ws);
    const ip = remoteIp(req);
    let windowStart = Date.now();
    let messageCount = 0;
    let typingCount = 0;
    log.info('ws_connect', { ip });

    ws.on('message', async (data) => {
      const now = Date.now();
      if (now - windowStart > RATE_WINDOW_MS) { windowStart = now; messageCount = 0; typingCount = 0; }
      let msg: ClientMsg;
      try {
        msg = JSON.parse(data.toString()) as ClientMsg;
      } catch {
        return transport.send({ type: 'error', message: 'Invalid JSON' });
      }
      // Rate limit AFTER parse, exempting typing_start/typing_stop by their parsed
      // type (a raw-substring exemption would be spoofable from a message body).
      // Typing fires around every keystroke — counting it burned ~2/3 of the budget
      // and rapid chatting hit the cap, silently dropping real send_message frames.
      // Typing gets its own generous cap so an exempt flood can't fan out unbounded.
      if (msg.type === 'typing_start' || msg.type === 'typing_stop') {
        typingCount += 1;
        if (typingCount > RATE_MAX_TYPING) return;
      } else {
        messageCount += 1;
        if (messageCount > RATE_MAX_MESSAGES) {
          log.warn('ws_rate_limited', { ip, userId: userProfile?.id });
          // Drop burst messages silently so the user never sees a flashing red
          // error or gets kicked for a brief burst of taps.
          return;
        }
      }

      // Register creates/loads a user profile (can happen before or without a room).
      if (msg.type === 'register') {
        void (async () => {
          // Reuse the saved account if the client sent its userId (keeps trophies
          // across app launches); otherwise look up by Game Center id or create.
          const loaded =
            (msg.userId ? await getUser(msg.userId) : null) ??
            (await findOrCreateUser(msg.gameCenterId ?? null, msg.name));
          const profile = await grantDevEmotesIfNeeded(loaded);
          userProfile = profile;
          addOnline(profile.id, ws);
          transport.send({
            type: 'profile',
            profile: toProfileView(profile),
          });
        })();
        return;
      }

      // Sign in with Apple / Continue with Google: verify the provider's identity
      // token, then find or create the matching account.
      if (msg.type === 'auth') {
        void (async () => {
          try {
            const verified =
              msg.provider === 'apple'
                ? await verifyAppleToken(msg.token)
                : msg.provider === 'facebook'
                  ? await verifyFacebookToken(msg.token)
                  : await verifyGoogleToken(msg.token);
            const name =
              msg.name?.trim() || verified.name || verified.email?.split('@')[0] || 'Oyuncu';
            const profile = await grantDevEmotesIfNeeded(await findOrCreateUserByProvider(
              msg.provider,
              verified.sub,
              verified.email ?? null,
              name,
              msg.userId,
            ));
            userProfile = profile;
            addOnline(profile.id, ws);
            transport.send({ type: 'profile', profile: toProfileView(profile) });
          } catch (err) {
            console.error(`[auth:${msg.provider}] verify failed:`, err instanceof Error ? err.message : err);
            transport.send({ type: 'error', message: 'Giriş doğrulanamadı' });
          }
        })();
        return;
      }

      // Guest login: create a throwaway account with an auto-assigned "M"+9-digit
      // username (no provider, no username picker). The client persists the
      // returned userId and re-registers with it on later launches, so the same
      // guest account — and its progress — is restored.
      if (msg.type === 'guest') {
        void (async () => {
          try {
            const profile = await createGuestUser();
            userProfile = profile;
            addOnline(profile.id, ws);
            transport.send({ type: 'profile', profile: toProfileView(profile) });
          } catch (err) {
            console.error('[guest] create failed:', err instanceof Error ? err.message : err);
            transport.send({ type: 'error', message: 'Misafir girişi başarısız' });
          }
        })();
        return;
      }

      if (msg.type === 'change_name') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Register first' });
        void (async () => {
          const result = await changeDisplayName(userProfile!.id, msg.newName);
          if (!result.ok) return transport.send({ type: 'error', message: result.error });
          userProfile = result.profile;
          transport.send({
            type: 'name_changed',
            profile: toProfileView(result.profile),
          });
        })();
        return;
      }

      // One-time unique username pick after sign-in. Accept the account id from
      // the connection's profile OR the message (persisted login re-using userId).
      if (msg.type === 'set_username') {
        const uid = userProfile?.id ?? msg.userId;
        if (!uid) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          const result = await setUsername(uid, msg.username);
          if (!result.ok) return transport.send({ type: 'error', message: result.error });
          userProfile = result.profile;
          transport.send({
            type: 'profile',
            profile: toProfileView(result.profile),
          });
        })();
        return;
      }

      // Buy a premium emote (needs the account, not a room).
      if (msg.type === 'buy_emote') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce kayıt ol' });
        void (async () => {
          const result = await buyEmote(userProfile!.id, msg.emoteId);
          if (!result.ok) return transport.send({ type: 'error', message: result.error });
          userProfile = result.profile;
          transport.send({
            type: 'emote_purchased',
            emoteId: msg.emoteId,
            profile: toProfileView(result.profile),
          });
        })();
        return;
      }

      // Equip up to 3 visual emotes into the match loadout.
      if (msg.type === 'equip_emotes') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          const result = await setEquippedEmotes(userProfile!.id, msg.emoteIds);
          if (!result.ok) return transport.send({ type: 'error', message: result.error });
          userProfile = result.profile;
          transport.send({ type: 'profile', profile: toProfileView(result.profile) });
        })();
        return;
      }

      // Choose a profile picture. Updates the account, then pushes the change live
      // to the current match opponent and to every online friend so it shows
      // instantly without a refresh.
      if (msg.type === 'set_avatar') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          const result = await setAvatar(userProfile!.id, msg.avatar ?? null);
          if (!result.ok) return transport.send({ type: 'error', message: result.error });
          userProfile = result.profile;
          transport.send({ type: 'profile', profile: toProfileView(result.profile) });
          // In a match → update the opponent's view of me immediately.
          if (ctx?.room) ctx.room.setAvatarFor(userProfile!.id, result.profile.avatar);
          // Online friends → refresh their friend list so my new picture appears.
          const friends = await listFriends(userProfile!.id);
          for (const f of friends) sendToUser(f.userId, await getFriendsData(f.userId));
        })();
        return;
      }

      // Profil çerçevesi tak/kaldır (seviye ödülü). Hesap güncellenir, sonra
      // maçtaki rakibe ve çevrimiçi arkadaşlara anında yansıtılır.
      if (msg.type === 'set_frame') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          const result = await setSelectedFrame(userProfile!.id, msg.frameId ?? null);
          if (!result.ok) return transport.send({ type: 'error', message: result.error });
          userProfile = result.profile;
          transport.send({ type: 'profile', profile: toProfileView(result.profile) });
          if (ctx?.room) ctx.room.setFrameFor(userProfile!.id, result.profile.selectedFrame);
          const friends = await listFriends(userProfile!.id);
          for (const f of friends) sendToUser(f.userId, await getFriendsData(f.userId));
        })();
        return;
      }

      // Seviye Yolu kartına dokunuldu — ödülü tek seferlik ver, taze profili gönder.
      if (msg.type === 'claim_level_reward') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          const result = await claimLevelReward(userProfile!.id, msg.level, msg.track ?? 'free');
          if (!result.ok) return transport.send({ type: 'error', message: result.error });
          const fresh = await getUser(userProfile!.id);
          if (fresh) userProfile = fresh;
          transport.send({
            type: 'level_reward_claimed',
            level: result.claim.level,
            diamonds: result.claim.diamonds,
            emoteId: result.claim.emoteId,
            frameTier: result.claim.frameTier,
            powerId: result.claim.powerId,
            track: result.claim.track,
            profile: toProfileView(userProfile!),
          });
        })();
        return;
      }

      // Profil istatistikleri: seri rekoru + mod bazlı kazanma/kaybetme kırılımı.
      if (msg.type === 'get_my_stats') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          try {
            const fresh = await getUser(userProfile!.id);
            if (fresh) userProfile = fresh;
            const modes = await getModeStats(userProfile!.id);
            transport.send({ type: 'my_stats', winStreak: userProfile!.winStreak, bestStreak: userProfile!.bestStreak, modes });
          } catch (err) {
            console.error('[get_my_stats] failed:', err instanceof Error ? err.message : err);
            transport.send({ type: 'error', message: 'İstatistikler alınamadı' });
          }
        })();
        return;
      }

      // Premium Seviye Yolu satın alma — 1000 elmas, tek seferlik, atomik.
      if (msg.type === 'buy_premium_road') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          try {
            const result = await buyPremiumRoad(userProfile!.id);
            if (!result.ok) return transport.send({ type: 'error', message: result.error });
            userProfile = result.profile;
            transport.send({ type: 'premium_road_purchased', profile: toProfileView(result.profile) });
          } catch (err) {
            console.error('[buy_premium_road] failed:', err instanceof Error ? err.message : err);
            transport.send({ type: 'error', message: 'Satın alma başarısız' });
          }
        })();
        return;
      }

      // Mağazadan güç satın alma — elmas düşer, envanter artar (atomik).
      if (msg.type === 'buy_power') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          try {
            const result = await buyPower(userProfile!.id, msg.powerId);
            if (!result.ok) return transport.send({ type: 'error', message: result.error });
            userProfile = result.profile;
            transport.send({ type: 'power_purchased', powerId: msg.powerId, profile: toProfileView(result.profile) });
          } catch (err) {
            console.error('[buy_power] failed:', err instanceof Error ? err.message : err);
            transport.send({ type: 'error', message: 'Satın alma başarısız' });
          }
        })();
        return;
      }

      // Özel güç etkinleştirme: 2x XP jetonu (1 saat) ya da Kupa Kalkanı kuşan.
      if (msg.type === 'use_power') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          try {
            const result = await usePower(userProfile!.id, msg.powerId);
            if (!result.ok) return transport.send({ type: 'error', message: result.error });
            userProfile = result.profile;
            transport.send({ type: 'power_used', powerId: msg.powerId, profile: toProfileView(result.profile) });
          } catch (err) {
            console.error('[use_power] failed:', err instanceof Error ? err.message : err);
            transport.send({ type: 'error', message: 'Güç kullanılamadı' });
          }
        })();
        return;
      }

      if (msg.type === 'buy_avatar') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce kayıt ol' });
        void (async () => {
          const result = await buyAvatar(userProfile!.id, msg.avatarId);
          if (!result.ok) return transport.send({ type: 'error', message: result.error });
          userProfile = result.profile;
          transport.send({ type: 'avatar_purchased', avatarId: msg.avatarId, profile: toProfileView(result.profile) });
          if (ctx?.room) ctx.room.setAvatarFor(userProfile!.id, result.profile.avatar);
          const friends = await listFriends(userProfile!.id);
          for (const f of friends) sendToUser(f.userId, await getFriendsData(f.userId));
        })();
        return;
      }

      // Validate an Apple IAP receipt and grant diamonds (server-authoritative).
      if (msg.type === 'verify_purchase') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce kayıt ol' });
        void (async () => {
          const result = await verifyApplePurchase(userProfile!.id, msg.receipt);
          if (!result.ok) return transport.send({ type: 'error', message: result.error });
          userProfile = result.profile;
          transport.send({ type: 'diamonds_granted', granted: result.granted, profile: toProfileView(result.profile) });
        })();
        return;
      }

      // Credit diamonds for watching a rewarded ad (server-capped, no client trust).
      // Uses its own ad_reward_result channel so it never resolves an in-flight IAP
      // verification (which keys off diamonds_granted).
      if (msg.type === 'grant_ad_reward') {
        if (!userProfile) return transport.send({ type: 'ad_reward_result', ok: false, error: 'Önce kayıt ol' });
        void (async () => {
          const result = await grantAdReward(userProfile!.id);
          if (!result.ok) return transport.send({ type: 'ad_reward_result', ok: false, error: result.error });
          userProfile = result.profile;
          transport.send({ type: 'ad_reward_result', ok: true, granted: result.granted, profile: toProfileView(result.profile) });
        })();
        return;
      }

      // Save this device's Expo push token for notifications. Needs a signed-in
      // account to attach the token to; silently ignored otherwise.
      if (msg.type === 'register_push') {
        if (!userProfile) return;
        void registerPushToken(userProfile.id, msg.token, msg.platform, msg.lang ?? 'tr')
          .catch((err) => log.warn('push_register_failed', { userId: userProfile?.id, error: err instanceof Error ? err.message : String(err) }));
        return;
      }

      // Permanently delete the signed-in account and all its data (App Store 5.1.1(v)),
      // then tear down the session so the client returns to the login screen.
      if (msg.type === 'leave_match') {
        // Deliberate exit (X onayı / arka plan hükmeni): reconnect grace YOK —
        // rakip hükmen sonucu ANINDA görür. Ardından gelen soket kapanışı
        // oyuncuyu zaten silinmiş bulur (no-op).
        if (ctx) { ctx.room.explicitLeave(ctx.playerId); ctx = null; }
        return;
      }
      if (msg.type === 'delete_account') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        const uid = userProfile.id;
        void (async () => {
          try {
            await deleteAccount(uid);
            if (ctx) { ctx.room.handleClose(ctx.playerId); ctx = null; }
            removeOnline(uid, ws);
            userProfile = undefined;
            transport.send({ type: 'account_deleted' });
          } catch (err) {
            log.warn('delete_account_failed', { userId: uid, error: err instanceof Error ? err.message : String(err) });
            transport.send({ type: 'error', message: 'Hesap silinemedi, tekrar dene' });
          }
        })();
        return;
      }

      // ---- Friend system (works with or without a room) ----
      if (msg.type === 'send_friend_request') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          const result = await sendFriendRequest(userProfile!.id, msg.targetCode, msg.targetUsername);
          if (!result.ok) return transport.send({ type: 'error', message: result.error });
          transport.send({ type: 'friend_request_sent' });
          // Notify the target in real-time if they're online
          sendToUser(result.toUserId, {
            type: 'friend_request_received',
            requestId: '', // the receiver will refresh their list
            fromId: userProfile!.id,
            fromName: userProfile!.displayName,
          });
        })();
        return;
      }
      if (msg.type === 'respond_friend_request') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          const result = await respondFriendRequest(userProfile!.id, msg.requestId, msg.accept);
          if (!result.ok) return transport.send({ type: 'error', message: result.error });
          transport.send({ type: 'friend_request_responded', requestId: msg.requestId, accepted: msg.accept });
          // Refresh my friend list…
          const myData = await getFriendsData(userProfile!.id);
          transport.send(myData);
          // …and push a fresh list to the original requester in real time so the
          // new friend appears for them instantly (no app restart needed).
          if (msg.accept) {
            const theirData = await getFriendsData(result.fromUserId);
            sendToUser(result.fromUserId, theirData);
          }
        })();
        return;
      }
      if (msg.type === 'list_friends') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          const data = await getFriendsData(userProfile!.id);
          transport.send(data);
        })();
        return;
      }
      if (msg.type === 'search_users') {
        void (async () => {
          const users = await searchUsers(msg.query, userProfile?.id);
          transport.send({ type: 'user_search_results', users });
        })();
        return;
      }
      if (msg.type === 'remove_friend') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          await removeFriend(userProfile!.id, msg.friendId);
          transport.send({ type: 'friend_removed', friendId: msg.friendId });
          const data = await getFriendsData(userProfile!.id);
          transport.send(data);
          // Push a fresh list to the other person too — they lose the friend live.
          sendToUser(msg.friendId, await getFriendsData(msg.friendId));
        })();
        return;
      }
      if (msg.type === 'invite_friend_match') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        const requestedMode = msg.options?.mode ?? 'team-team';
        if (!canUseMode(userProfile, requestedMode)) return transport.send({ type: 'error', message: SOCIAL_PACK_REQUIRED });
        const fromId = userProfile.id;
        const inviterProfile = userProfile;
        void (async () => {
          // Guideline 1.2: blocking must close match invites too. Blocking already
          // drops the friendship, but a stale client list could still fire one —
          // the server is what says no. Awaited: the invite must NOT be created
          // while the check is still in flight.
          if (await isBlockedBetween(fromId, msg.friendId)) {
            transport.send({ type: 'error', message: 'Bu kullanıcıya davet gönderemezsin' });
            return;
          }
          const key = `${fromId}:${msg.friendId}`;
          // Replace any prior pending invite to the same friend.
          const prev = pendingInvites.get(key);
          if (prev) clearTimeout(prev.timer);
          // Auto-expire after 30s so it can't hang forever.
          const timer = setTimeout(() => {
            if (pendingInvites.get(key)) {
              pendingInvites.delete(key);
              sendToUser(msg.friendId, { type: 'match_invite_cancelled' });
            }
          }, 30_000);
          pendingInvites.set(key, {
            fromUserId: fromId,
            toUserId: msg.friendId,
            fromName: inviterProfile.displayName,
            transport,
            ws,
            userProfile: inviterProfile,
            options: msg.options,
            setCtx: (c) => { ctx = c; },
            timer,
          });
          sendToUser(msg.friendId, {
            type: 'match_invite_received',
            fromId,
            fromName: inviterProfile.displayName,
            options: msg.options,
          });
        })();
        return;
      }
      if (msg.type === 'respond_match_invite') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        const key = `${msg.fromId}:${userProfile.id}`;
        const inv = pendingInvites.get(key);
        if (!inv) { transport.send({ type: 'match_invite_cancelled' }); return; }
        clearTimeout(inv.timer);
        pendingInvites.delete(key);
        if (!msg.accept) {
          sendToUser(inv.fromUserId, { type: 'match_invite_declined', byId: userProfile.id });
          return;
        }
        const requestedMode = inv.options?.mode ?? 'team-team';
        if (!canUseMode(userProfile, requestedMode) || !canUseMode(inv.userProfile, requestedMode)) {
          sendToUser(inv.fromUserId, { type: 'match_invite_declined', byId: userProfile.id });
          transport.send({ type: 'error', message: SOCIAL_PACK_REQUIRED });
          return;
        }
        // Accepted — drop both players into a fresh room and auto-start.
        if (inv.ws.readyState !== inv.ws.OPEN) { transport.send({ type: 'match_invite_cancelled' }); return; }
        const room = manager.createRoom();
        if (inv.options?.scope) room.scope = inv.options.scope;
        room.gameMode = requestedMode;
        const resA = room.addPlayer(inv.fromName, inv.transport, true, inv.fromUserId, inv.userProfile?.trophies, inv.userProfile?.arena, inv.userProfile?.avatar, inv.userProfile?.level, inv.userProfile?.selectedFrame);
        const resB = room.addPlayer(userProfile.displayName, transport, false, userProfile.id, userProfile.trophies, userProfile.arena, userProfile.avatar, userProfile.level, userProfile.selectedFrame);
        if (resA.ok) inv.setCtx({ room, playerId: resA.id, userProfile: inv.userProfile });
        if (resB.ok) ctx = { room, playerId: resB.id, userProfile };
        setTimeout(() => { if (room.size === 2) room.handle(resA.ok ? resA.id : '', { type: 'start' }); }, 3500);
        return;
      }
      if (msg.type === 'cancel_match_invite') {
        if (!userProfile) return;
        const key = `${userProfile.id}:${msg.toId}`;
        const inv = pendingInvites.get(key);
        if (inv) { clearTimeout(inv.timer); pendingInvites.delete(key); }
        sendToUser(msg.toId, { type: 'match_invite_cancelled' });
        return;
      }
      if (msg.type === 'get_user_profile') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          const u = await getUser(msg.userId);
          if (!u) return transport.send({ type: 'error', message: 'Kullanıcı bulunamadı' });
          transport.send({
            type: 'user_profile',
            profile: { userId: u.id, displayName: u.displayName, selectedAvatar: u.selectedAvatar, trophies: u.trophies, wins: u.wins, losses: u.losses, arena: u.arena, avatar: u.avatar, frame: u.selectedFrame },
          });
        })();
        return;
      }
      if (msg.type === 'list_match_history') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          const matches = await getMatchHistory(userProfile!.id);
          transport.send({ type: 'match_history_list', matches });
        })();
        return;
      }

      // ---- Direct Messages ----
      if (msg.type === 'send_message') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        const rawBody = (msg.body ?? '').trim();
        if (!rawBody || rawBody.length > 500) return;
        const body = censorMessage(rawBody);
        void (async () => {
          // Guideline 1.2 — no ANONYMOUS content. Enforced server-side, not just
          // in the UI: this is the exact finding App Review cited.
          if (!(await isIdentifiedAccount(userProfile!.id))) {
            transport.send({ type: 'error', message: GUEST_BLOCKED_MSG });
            return;
          }
          // Guideline 1.2 block gate. Checked in BOTH directions: a one-way check
          // would still let the person you blocked keep messaging you.
          if (await isBlockedBetween(userProfile!.id, msg.toUserId)) {
            transport.send({ type: 'error', message: 'Bu kullanıcıya mesaj gönderemezsin' });
            return;
          }
          const { rows } = await pool.query<{ id: string; created_at: string }>(
            `INSERT INTO messages (from_user, to_user, body) VALUES ($1, $2, $3) RETURNING id, created_at`,
            [userProfile!.id, msg.toUserId, body],
          );
          const row = rows[0];
          if (!row) return;
          const mv: MessageView = {
            id: row.id,
            fromId: userProfile!.id,
            fromName: userProfile!.displayName,
            toId: msg.toUserId,
            body,
            createdAt: row.created_at,
          };
          // Send to sender as confirmation
          transport.send({ type: 'message_received', message: mv });
          // Send to recipient if online
          sendToUser(msg.toUserId, { type: 'message_received', message: mv });
          // Recipient has no live socket → push notification instead. Badge =
          // their unread DMs + pending friend requests, so the app icon count
          // matches what they'll see inside. Fire-and-forget: a push failure
          // must never affect message delivery.
          if (!onlineUsers.has(msg.toUserId)) {
            const sender = userProfile!;
            void (async () => {
              const { rows: cnt } = await pool.query<{ badge: string }>(
                `SELECT (SELECT COUNT(*) FROM messages WHERE to_user = $1 AND read_at IS NULL)
                      + (SELECT COUNT(*) FROM friend_requests WHERE to_user = $1) AS badge`,
                [msg.toUserId],
              );
              const preview = body.replace(/\s+/g, ' ').trim().slice(0, 100);
              await sendPushToUsers([msg.toUserId], {
                title: sender.displayName,
                body: preview,
                data: { kind: 'message', fromId: sender.id },
                badge: Number(cnt[0]?.badge ?? 0),
              });
            })().catch((err) => log.warn('push_message_failed', { toUserId: msg.toUserId, error: err instanceof Error ? err.message : String(err) }));
          }
        })();
        return;
      }
      if (msg.type === 'list_messages') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          const beforeClause = msg.before ? `AND m.created_at < $3` : '';
          const params: any[] = [userProfile!.id, msg.withUserId];
          if (msg.before) params.push(msg.before);
          const { rows } = await pool.query<{
            id: string; from_user: string; to_user: string; body: string; created_at: string; from_name: string; deleted_at: string | null;
          }>(
            `SELECT m.id, m.from_user, m.to_user, m.body, m.created_at, m.deleted_at, u.display_name as from_name
             FROM messages m
             JOIN users u ON u.id = m.from_user
             WHERE ((m.from_user = $1 AND m.to_user = $2) OR (m.from_user = $2 AND m.to_user = $1))
             ${beforeClause}
             ORDER BY m.created_at DESC, m.id DESC
             LIMIT 50`,
            params,
          );
          const messages: MessageView[] = rows.map(r => ({
            id: r.id,
            fromId: r.from_user,
            fromName: r.from_name,
            toId: r.to_user,
            // A removed message keeps its row (reports need the evidence) but its
            // text must never reach a client again.
            body: r.deleted_at ? '' : r.body,
            createdAt: r.created_at,
            ...(r.deleted_at ? { deleted: true } : {}),
          }));
          transport.send({ type: 'message_list', messages: messages.reverse(), withUserId: msg.withUserId });
        })();
        return;
      }
      if (msg.type === 'list_conversations') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          // Get distinct conversation partners with last message + unread count
          const { rows } = await pool.query<{
            partner_id: string; partner_name: string; partner_avatar: string | null; partner_frame: string | null; last_body: string; last_at: string; unread: string;
          }>(`
            WITH convos AS (
              SELECT
                CASE WHEN from_user = $1 THEN to_user ELSE from_user END AS partner_id,
                body, created_at,
                ROW_NUMBER() OVER (PARTITION BY LEAST(from_user, to_user), GREATEST(from_user, to_user) ORDER BY created_at DESC) AS rn
              FROM messages
              WHERE from_user = $1 OR to_user = $1
            )
            SELECT
              c.partner_id,
              u.display_name AS partner_name,
              COALESCE(u.avatar, u.selected_avatar) AS partner_avatar,
              u.selected_frame AS partner_frame,
              c.body AS last_body,
              c.created_at AS last_at,
              COALESCE((SELECT COUNT(*) FROM messages WHERE from_user = c.partner_id AND to_user = $1 AND read_at IS NULL), 0) AS unread
            FROM convos c
            JOIN users u ON u.id = c.partner_id
            WHERE c.rn = 1
              -- Guideline 1.2: a blocked person disappears from the inbox, in both
              -- directions. Without this the chat stays listed and looks reachable.
              AND NOT EXISTS (
                SELECT 1 FROM blocked_users b
                 WHERE (b.blocker_id = $1 AND b.blocked_id = c.partner_id)
                    OR (b.blocker_id = c.partner_id AND b.blocked_id = $1)
              )
            ORDER BY c.created_at DESC, c.partner_id ASC
            LIMIT 50
          `, [userProfile!.id]);
          const conversations = rows.map(r => ({
            userId: r.partner_id,
            displayName: r.partner_name,
            selectedAvatar: r.partner_avatar ?? undefined,
            online: onlineUsers.has(r.partner_id),
            lastMessage: r.last_body,
            lastMessageAt: r.last_at,
            unreadCount: Number(r.unread),
            avatar: r.partner_avatar ?? null,
            frame: r.partner_frame ?? null,
          }));
          transport.send({ type: 'conversation_list', conversations });
        })();
        return;
      }
      if (msg.type === 'mark_read') {
        if (!userProfile) return;
        void (async () => {
          await pool.query(
            `UPDATE messages SET read_at = now() WHERE from_user = $1 AND to_user = $2 AND read_at IS NULL`,
            [msg.fromUserId, userProfile!.id],
          );
          transport.send({ type: 'messages_marked_read', fromUserId: msg.fromUserId });
          // Notify the sender their messages were read
          sendToUser(msg.fromUserId, { type: 'messages_marked_read', fromUserId: userProfile!.id });
        })();
        return;
      }
      if (msg.type === 'typing_start') {
        if (!userProfile) return;
        sendToUser(msg.toUserId, { type: 'typing', fromUserId: userProfile!.id, isTyping: true });
        return;
      }
      if (msg.type === 'typing_stop') {
        if (!userProfile) return;
        sendToUser(msg.toUserId, { type: 'typing', fromUserId: userProfile!.id, isTyping: false });
        return;
      }

      // ---- User-generated-content safety (App Store guideline 1.2) ----
      if (msg.type === 'block_user') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        if (msg.userId === userProfile.id) return;
        void (async () => {
          await blockUser(userProfile!.id, msg.userId);
          transport.send({ type: 'user_blocked', userId: msg.userId });
          // Blocking removed the friendship — refresh both lists so neither side
          // is left showing a friend the server no longer has.
          transport.send(await getFriendsData(userProfile!.id));
          sendToUser(msg.userId, await getFriendsData(msg.userId));
        })().catch((err) => {
          log.warn('block_failed', { error: err instanceof Error ? err.message : String(err) });
          transport.send({ type: 'error', message: 'Kullanıcı engellenemedi' });
        });
        return;
      }
      if (msg.type === 'unblock_user') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          await unblockUser(userProfile!.id, msg.userId);
          transport.send({ type: 'user_unblocked', userId: msg.userId });
          transport.send({ type: 'blocked_list', users: await listBlocked(userProfile!.id) });
        })().catch(() => transport.send({ type: 'error', message: 'İşlem başarısız' }));
        return;
      }
      if (msg.type === 'list_blocked') {
        if (!userProfile) return;
        void (async () => {
          transport.send({ type: 'blocked_list', users: await listBlocked(userProfile!.id) });
        })().catch(() => {});
        return;
      }
      if (msg.type === 'report_content') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        if (msg.userId === userProfile.id) return;
        void (async () => {
          await reportContent(userProfile!.id, msg.userId, msg.reason ?? 'unspecified', msg.messageId);
          transport.send({ type: 'report_filed' });
        })().catch((err) => {
          log.warn('report_failed', { error: err instanceof Error ? err.message : String(err) });
          transport.send({ type: 'error', message: 'Şikâyet gönderilemedi' });
        });
        return;
      }
      if (msg.type === 'delete_message') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          // Look the recipient up BEFORE the soft-delete so we can tell them too —
          // "remove from the feed" has to clear the other side, not just my view.
          const { rows } = await pool.query<{ to_user: string }>(
            `SELECT to_user FROM messages WHERE id = $1 AND from_user = $2`,
            [msg.messageId, userProfile!.id],
          );
          const ok = await deleteOwnMessage(userProfile!.id, msg.messageId);
          if (!ok) return;
          transport.send({ type: 'message_deleted', messageId: msg.messageId });
          const to = rows[0]?.to_user;
          if (to) sendToUser(to, { type: 'message_deleted', messageId: msg.messageId });
        })().catch(() => transport.send({ type: 'error', message: 'Mesaj silinemedi' }));
        return;
      }
      if (msg.type === 'accept_terms') {
        if (!userProfile) return;
        void acceptTerms(userProfile.id).catch(() => {});
        return;
      }

      // First message must establish the connection (create / solo / join / find_match).
      if (!ctx) {
        if (config.maintenanceMode) {
          transport.send({ type: 'error', message: 'Bakım modundayız, birazdan tekrar dene' });
          return;
        }
        if (msg.type === 'resume_room') {
          const room = manager.get(msg.code);
          if (!room) return transport.send({ type: 'error', message: 'Maç bulunamadı' });
          const resumed = room.resumePlayer(msg.userId, transport);
          if (!resumed.ok) return transport.send({ type: 'error', message: resumed.error });
          const u = await getUser(msg.userId).catch(() => null);
          if (u) { userProfile = u; addOnline(u.id, ws); }
          ctx = { room, playerId: resumed.id, userProfile: u ?? undefined };
          log.info('room_resumed', { room: msg.code, userId: msg.userId });
          return;
        }
        if (msg.type === 'find_match') {
          void (async () => {
            // Fresh match sockets may not have registered yet; load the canonical
            // server profile once so room membership and trophy updates never trust
            // a stale/spoofed client-sent user id over the authenticated account.
            userProfile = await ensureProfileLoaded(userProfile, msg.userId, ws);
            // Prefer the registered profile name; fall back to the name the client
            // sent with the request (the matchmaking socket may not have registered).
            const name = userProfile?.displayName ?? msg.name ?? 'Oyuncu';
            // Remove stale entries for this ws (if they spammed the button)
            for (let i = matchQueue.length - 1; i >= 0; i--) {
              if (matchQueue[i]!.ws === ws) matchQueue.splice(i, 1);
            }
            // Try to pair with someone already waiting
            // Match by game mode AND arena: only pair players in the same arena
            const requestedMode = msg.options?.mode ?? 'team-team';
            if (!canUseMode(userProfile, requestedMode)) {
              transport.send({ type: 'error', message: SOCIAL_PACK_REQUIRED });
              return;
            }
            const myTrophies = userProfile?.trophies ?? 0;
            const partnerIdx = matchQueue.findIndex(
              (e) => e.ws.readyState === e.ws.OPEN
                && (e.options?.mode ?? 'team-team') === requestedMode
                && canUseMode(e.userProfile, requestedMode)
                && Math.abs((e.userProfile?.trophies ?? 0) - myTrophies) <= MATCH_TROPHY_RANGE,
            );
            const partner = partnerIdx >= 0 ? matchQueue.splice(partnerIdx, 1)[0]! : undefined;
            if (partner && partner.ws.readyState === partner.ws.OPEN) {
              // Create room and add both
              const room = manager.createRoom();
              room.ranked = true; // yalnız hızlı eşleşme kupa + XP verir
              if (msg.options?.scope) room.scope = msg.options.scope;
              room.gameMode = requestedMode;
              const resA = room.addPlayer(partner.name, partner.transport, true, partner.userProfile?.id ?? partner.userId, partner.userProfile?.trophies, partner.userProfile?.arena, partner.userProfile?.avatar, partner.userProfile?.level, partner.userProfile?.selectedFrame);
              const resB = room.addPlayer(name, transport, false, userProfile?.id ?? msg.userId, userProfile?.trophies, userProfile?.arena, userProfile?.avatar, userProfile?.level, userProfile?.selectedFrame);
              if (resA.ok) partner.setCtx({ room, playerId: resA.id, userProfile: partner.userProfile });
              if (resB.ok) ctx = { room, playerId: resB.id, userProfile };
              // Auto-start after matchup reveal delay
              setTimeout(() => {
                if (room.size === 2) room.handle(resA.ok ? resA.id : '', { type: 'start' });
              }, 3500);
            } else {
              // No partner yet — wait in queue
              const entry: QueueEntry = {
                transport,
                ws,
                name,
                userId: userProfile?.id ?? msg.userId,
                userProfile,
                options: msg.options,
                setCtx: (c) => { ctx = c; },
              };
              matchQueue.push(entry);
              transport.send({ type: 'searching' as any });
            }
          })();
          return;
        }

        if (msg.type === 'create_room') {
          userProfile = await ensureProfileLoaded(userProfile, msg.userId, ws);
          if (!canUseMode(userProfile, msg.options?.mode)) return transport.send({ type: 'error', message: SOCIAL_PACK_REQUIRED });
          const room = manager.createRoom();
          if (msg.options?.scope) room.scope = msg.options.scope;
          if (msg.options?.mode) room.gameMode = msg.options.mode;
          const name = userProfile?.displayName ?? msg.name;
          const res = room.addPlayer(name, transport, true, userProfile?.id ?? msg.userId, userProfile?.trophies, userProfile?.arena, userProfile?.avatar, userProfile?.level, userProfile?.selectedFrame);
          if (res.ok) ctx = { room, playerId: res.id, userProfile };
          return;
        }
        if (msg.type === 'create_solo') {
          userProfile = await ensureProfileLoaded(userProfile, msg.userId, ws);
          // Bot antrenman maçında TÜM modlar serbest — Sosyal Paket kilidi yalnız
          // insanlarla oynanan (find_match / oda / davet) maçlara uygulanır.
          const room = manager.createRoom();
          if (msg.options?.scope) room.scope = msg.options.scope;
          if (msg.options?.mode) room.gameMode = msg.options.mode;
          const name = userProfile?.displayName ?? msg.name;
          const res = room.addPlayer(name, transport, true, userProfile?.id ?? msg.userId, userProfile?.trophies, userProfile?.arena, userProfile?.avatar, userProfile?.level, userProfile?.selectedFrame);
          if (res.ok) ctx = { room, playerId: res.id, userProfile };
          const bot = new BotPlayer({ difficulty: msg.options?.difficulty, scope: room.scope, mode: room.gameMode });
          const botRes = room.addPlayer('Bot', bot, false);
          if (botRes.ok) bot.bind(room, botRes.id);
          return;
        }
        if (msg.type === 'join_room') {
          userProfile = await ensureProfileLoaded(userProfile, msg.userId, ws);
          const room = manager.get(msg.code);
          if (!room) return transport.send({ type: 'error', message: 'Room not found' });
          if (!canUseMode(userProfile, room.gameMode)) return transport.send({ type: 'error', message: SOCIAL_PACK_REQUIRED });
          const name = userProfile?.displayName ?? msg.name;
          const res = room.addPlayer(name, transport, false, userProfile?.id ?? msg.userId, userProfile?.trophies, userProfile?.arena, userProfile?.avatar, userProfile?.level, userProfile?.selectedFrame);
          if (!res.ok) return transport.send({ type: 'error', message: res.error });
          ctx = { room, playerId: res.id, userProfile };
          return;
        }
        return transport.send({ type: 'error', message: 'Create or join a room first' });
      }

      ctx.room.handle(ctx.playerId, msg);
    });

    ws.on('close', () => {
      log.info('ws_close', { ip, userId: userProfile?.id, room: ctx?.room.code });
      // Remove from online users tracking — but only if THIS socket is the one
      // registered (a fresh reconnect may have already replaced it).
      if (userProfile) removeOnline(userProfile.id, ws);
      // Drop any pending match invites involving this socket.
      for (const [key, inv] of pendingInvites) {
        if (inv.ws === ws) {
          clearTimeout(inv.timer);
          pendingInvites.delete(key);
          sendToUser(inv.toUserId, { type: 'match_invite_cancelled' });
        }
      }
      // Remove from matchmaking queue if waiting
      for (let i = matchQueue.length - 1; i >= 0; i--) {
        if (matchQueue[i]!.ws === ws) matchQueue.splice(i, 1);
      }
      if (ctx) ctx.room.handleClose(ctx.playerId);
    });
    ws.on('error', () => {
      for (let i = matchQueue.length - 1; i >= 0; i--) {
        if (matchQueue[i]!.ws === ws) matchQueue.splice(i, 1);
      }
      if (ctx) ctx.room.handleClose(ctx.playerId);
    });
  });

  http.listen(port, () => {
    console.log(`Crossover server listening on :${port} (ws + /health)`);
  });
  return http;
}
