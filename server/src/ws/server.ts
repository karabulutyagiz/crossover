import { createServer, type Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { RoomManager } from '../rooms/manager.ts';
import { BotPlayer } from '../rooms/bot.ts';
import { listScopes, listNationalities } from '../game/verify.ts';
import {
  findOrCreateUser, findOrCreateUserByProvider, getUser, changeDisplayName,
  setUsername, buyEmote, getLeaderboard,
  listFriends, listFriendRequests, sendFriendRequest, respondFriendRequest,
  removeFriend, searchUsers, getMatchHistory,
  type UserProfile,
} from '../game/rank.ts';
import { verifyAppleToken, verifyGoogleToken, verifyFacebookToken } from '../game/auth.ts';
import type { Room, Transport } from '../rooms/room.ts';
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
    ownedEmotes: p.ownedEmotes,
    usernameSet: p.usernameSet,
    socialPackUntil: p.socialPackUntil,
    arena: p.arena,
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

// Track online users for real-time friend notifications.
const onlineUsers = new Map<string, WebSocket>(); // userId → WebSocket

function sendToUser(userId: string, msg: ServerMsg): void {
  const ws = onlineUsers.get(userId);
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
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
          const profile =
            (msg.userId ? await getUser(msg.userId) : null) ??
            (await findOrCreateUser(msg.gameCenterId ?? null, msg.name));
          userProfile = profile;
          onlineUsers.set(profile.id, ws);
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
            const profile = await findOrCreateUserByProvider(
              msg.provider,
              verified.sub,
              verified.email ?? null,
              name,
            );
            userProfile = profile;
            onlineUsers.set(profile.id, ws);
            transport.send({ type: 'profile', profile: toProfileView(profile) });
          } catch (err) {
            console.error(`[auth:${msg.provider}] verify failed:`, err instanceof Error ? err.message : err);
            transport.send({ type: 'error', message: 'Giriş doğrulanamadı' });
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
          // Refresh both users' friend lists
          const myData = await getFriendsData(userProfile!.id);
          transport.send(myData);
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
        })();
        return;
      }
      if (msg.type === 'invite_friend_match') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        sendToUser(msg.friendId, {
          type: 'match_invite_received',
          fromId: userProfile.id,
          fromName: userProfile.displayName,
          options: msg.options,
        });
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

      // First message must establish the connection (create / solo / join / find_match).
      if (!ctx) {
        if (msg.type === 'find_match') {
          // Prefer the registered profile name; fall back to the name the client
          // sent with the request (the matchmaking socket may not have registered).
          const name = userProfile?.displayName ?? msg.name ?? 'Oyuncu';
          // Remove stale entries for this ws (if they spammed the button)
          for (let i = matchQueue.length - 1; i >= 0; i--) {
            if (matchQueue[i]!.ws === ws) matchQueue.splice(i, 1);
          }
          // Try to pair with someone already waiting
          // Match by game mode: only pair players with the same mode
          const requestedMode = msg.options?.mode ?? 'team-team';
          const partnerIdx = matchQueue.findIndex(
            (e) => e.ws.readyState === e.ws.OPEN && (e.options?.mode ?? 'team-team') === requestedMode,
          );
          const partner = partnerIdx >= 0 ? matchQueue.splice(partnerIdx, 1)[0]! : undefined;
          if (partner && partner.ws.readyState === partner.ws.OPEN) {
            // Create room and add both
            const room = manager.createRoom();
            if (msg.options?.scope) room.scope = msg.options.scope;
            room.gameMode = requestedMode;
            const resA = room.addPlayer(partner.name, partner.transport, true, partner.userId);
            const resB = room.addPlayer(name, transport, false, msg.userId ?? userProfile?.id);
            if (resA.ok) partner.setCtx({ room, playerId: resA.id, userProfile: partner.userProfile });
            if (resB.ok) ctx = { room, playerId: resB.id, userProfile };
            // Auto-start after a short delay
            setTimeout(() => {
              if (room.size === 2) room.handle(resA.ok ? resA.id : '', { type: 'start' });
            }, 1500);
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
          return;
        }

        if (msg.type === 'create_room') {
          const room = manager.createRoom();
          if (msg.options?.scope) room.scope = msg.options.scope;
          if (msg.options?.mode) room.gameMode = msg.options.mode;
          const name = userProfile?.displayName ?? msg.name;
          const res = room.addPlayer(name, transport, true, msg.userId ?? userProfile?.id);
          if (res.ok) ctx = { room, playerId: res.id, userProfile };
          return;
        }
        if (msg.type === 'create_solo') {
          const room = manager.createRoom();
          if (msg.options?.scope) room.scope = msg.options.scope;
          if (msg.options?.mode) room.gameMode = msg.options.mode;
          const name = userProfile?.displayName ?? msg.name;
          const res = room.addPlayer(name, transport, true, msg.userId ?? userProfile?.id);
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
          const res = room.addPlayer(name, transport, false, msg.userId ?? userProfile?.id);
          if (!res.ok) return transport.send({ type: 'error', message: res.error });
          ctx = { room, playerId: res.id, userProfile };
          return;
        }
        return transport.send({ type: 'error', message: 'Create or join a room first' });
      }

      ctx.room.handle(ctx.playerId, msg);
    });

    ws.on('close', () => {
      // Remove from online users tracking
      if (userProfile) onlineUsers.delete(userProfile.id);
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
