import { createServer, type Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { RoomManager } from '../rooms/manager.ts';
import { BotPlayer } from '../rooms/bot.ts';
import { listScopes, listNationalities } from '../game/verify.ts';
import {
  findOrCreateUser, findOrCreateUserByProvider, createGuestUser, getUser, changeDisplayName,
  grantDevEmotesIfNeeded,
  setUsername, buyEmote, setEquippedEmotes, setAvatar, buyAvatar, touchLastSeen, getLeaderboard, grantAdReward,
  listFriends, listFriendRequests, sendFriendRequest, respondFriendRequest,
  removeFriend, searchUsers, getMatchHistory,
  getArena,
  type UserProfile,
} from '../game/rank.ts';
import { verifyAppleToken, verifyGoogleToken, verifyFacebookToken } from '../game/auth.ts';
import { censorMessage } from '../game/username.ts';
import { verifyApplePurchase } from '../game/iap.ts';
import { pool } from '../db/pool.ts';
import type { Room, Transport } from '../rooms/room.ts';
import type { MessageView, ConversationView } from '../protocol.ts';
import type { ClientMsg, ProfileView, ServerMsg } from '../protocol.ts';

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
  const matchQueue: QueueEntry[] = [];
  const pendingInvites = new Map<string, PendingInvite>(); // `${fromUserId}:${toUserId}`
  const http = createServer((req, res) => {
    const cors = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
    if (req.url === '/health') {
      res.writeHead(200, cors);
      res.end(JSON.stringify({ ok: true, rooms: manager.count }));
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

  wss.on('connection', (ws: WebSocket) => {
    let ctx: ConnCtx | null = null;
    let userProfile: UserProfile | undefined;
    const transport = wsTransport(ws);

    ws.on('message', (data) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(data.toString()) as ClientMsg;
      } catch {
        return transport.send({ type: 'error', message: 'Invalid JSON' });
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
          const users = await searchUsers(msg.query);
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
        const fromId = userProfile.id;
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
          fromName: userProfile.displayName,
          transport,
          ws,
          userProfile,
          options: msg.options,
          setCtx: (c) => { ctx = c; },
          timer,
        });
        sendToUser(msg.friendId, {
          type: 'match_invite_received',
          fromId,
          fromName: userProfile.displayName,
          options: msg.options,
        });
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
        // Accepted — drop both players into a fresh room and auto-start.
        if (inv.ws.readyState !== inv.ws.OPEN) { transport.send({ type: 'match_invite_cancelled' }); return; }
        const room = manager.createRoom();
        if (inv.options?.scope) room.scope = inv.options.scope;
        room.gameMode = inv.options?.mode ?? 'team-team';
        const resA = room.addPlayer(inv.fromName, inv.transport, true, inv.fromUserId, inv.userProfile?.trophies, inv.userProfile?.arena, inv.userProfile?.avatar);
        const resB = room.addPlayer(userProfile.displayName, transport, false, userProfile.id, userProfile.trophies, userProfile.arena, userProfile.avatar);
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
            profile: { userId: u.id, displayName: u.displayName, selectedAvatar: u.selectedAvatar, trophies: u.trophies, wins: u.wins, losses: u.losses, arena: u.arena, avatar: u.avatar },
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
            id: string; from_user: string; to_user: string; body: string; created_at: string; from_name: string;
          }>(
            `SELECT m.id, m.from_user, m.to_user, m.body, m.created_at, u.display_name as from_name
             FROM messages m
             JOIN users u ON u.id = m.from_user
             WHERE ((m.from_user = $1 AND m.to_user = $2) OR (m.from_user = $2 AND m.to_user = $1))
             ${beforeClause}
             ORDER BY m.created_at DESC
             LIMIT 50`,
            params,
          );
          const messages: MessageView[] = rows.map(r => ({
            id: r.id,
            fromId: r.from_user,
            fromName: r.from_name,
            toId: r.to_user,
            body: r.body,
            createdAt: r.created_at,
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
            partner_id: string; partner_name: string; partner_avatar: string | null; last_body: string; last_at: string; unread: string;
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
              c.body AS last_body,
              c.created_at AS last_at,
              COALESCE((SELECT COUNT(*) FROM messages WHERE from_user = c.partner_id AND to_user = $1 AND read_at IS NULL), 0) AS unread
            FROM convos c
            JOIN users u ON u.id = c.partner_id
            WHERE c.rn = 1
            ORDER BY c.created_at DESC
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

      // First message must establish the connection (create / solo / join / find_match).
      if (!ctx) {
        if (msg.type === 'find_match') {
          void (async () => {
            // If this is a fresh socket (no register/auth yet), look up the profile
            // from the userId the client sent so trophies/arena are available.
            if (!userProfile && msg.userId) {
              const u = await getUser(msg.userId);
              if (u) { userProfile = u; addOnline(u.id, ws); }
            }
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
            const myArena = getArena(userProfile?.trophies ?? 0).name;
            const partnerIdx = matchQueue.findIndex(
              (e) => e.ws.readyState === e.ws.OPEN
                && (e.options?.mode ?? 'team-team') === requestedMode
                && getArena(e.userProfile?.trophies ?? 0).name === myArena,
            );
            const partner = partnerIdx >= 0 ? matchQueue.splice(partnerIdx, 1)[0]! : undefined;
            if (partner && partner.ws.readyState === partner.ws.OPEN) {
              // Create room and add both
              const room = manager.createRoom();
              if (msg.options?.scope) room.scope = msg.options.scope;
              room.gameMode = requestedMode;
              const resA = room.addPlayer(partner.name, partner.transport, true, partner.userId, partner.userProfile?.trophies, partner.userProfile?.arena, partner.userProfile?.avatar);
              const resB = room.addPlayer(name, transport, false, msg.userId ?? userProfile?.id, userProfile?.trophies, userProfile?.arena, userProfile?.avatar);
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
                userId: msg.userId ?? userProfile?.id,
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
          const room = manager.createRoom();
          if (msg.options?.scope) room.scope = msg.options.scope;
          if (msg.options?.mode) room.gameMode = msg.options.mode;
          const name = userProfile?.displayName ?? msg.name;
          const res = room.addPlayer(name, transport, true, msg.userId ?? userProfile?.id, userProfile?.trophies, userProfile?.arena, userProfile?.avatar);
          if (res.ok) ctx = { room, playerId: res.id, userProfile };
          return;
        }
        if (msg.type === 'create_solo') {
          const room = manager.createRoom();
          if (msg.options?.scope) room.scope = msg.options.scope;
          if (msg.options?.mode) room.gameMode = msg.options.mode;
          const name = userProfile?.displayName ?? msg.name;
          const res = room.addPlayer(name, transport, true, msg.userId ?? userProfile?.id, userProfile?.trophies, userProfile?.arena, userProfile?.avatar);
          if (res.ok) ctx = { room, playerId: res.id, userProfile };
          const bot = new BotPlayer({ difficulty: msg.options?.difficulty, scope: room.scope, mode: room.gameMode });
          const botRes = room.addPlayer('Bot', bot, false);
          if (botRes.ok) bot.bind(room, botRes.id);
          return;
        }
        if (msg.type === 'join_room') {
          const room = manager.get(msg.code);
          if (!room) return transport.send({ type: 'error', message: 'Room not found' });
          const name = userProfile?.displayName ?? msg.name;
          const res = room.addPlayer(name, transport, false, msg.userId ?? userProfile?.id, userProfile?.trophies, userProfile?.arena, userProfile?.avatar);
          if (!res.ok) return transport.send({ type: 'error', message: res.error });
          ctx = { room, playerId: res.id, userProfile };
          return;
        }
        return transport.send({ type: 'error', message: 'Create or join a room first' });
      }

      ctx.room.handle(ctx.playerId, msg);
    });

    ws.on('close', () => {
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
