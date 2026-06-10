import { createServer, type Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { RoomManager } from '../rooms/manager.ts';
import { BotPlayer } from '../rooms/bot.ts';
import { listScopes, listNationalities } from '../game/verify.ts';
import { findOrCreateUser, findOrCreateUserByProvider, getUser, changeDisplayName, setUsername, buyEmote, getLeaderboard, type UserProfile } from '../game/rank.ts';
import { verifyAppleToken, verifyGoogleToken, verifyFacebookToken } from '../game/auth.ts';
import type { Room, Transport } from '../rooms/room.ts';
import type { ClientMsg, ServerMsg } from '../protocol.ts';

interface ConnCtx {
  room: Room;
  playerId: string;
  userProfile?: UserProfile;
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
          transport.send({
            type: 'profile',
            profile: {
              userId: profile.id,
              displayName: profile.displayName,
              trophies: profile.trophies,
              diamonds: profile.diamonds,
              wins: profile.wins,
              losses: profile.losses,
              ownedEmotes: profile.ownedEmotes,
              usernameSet: profile.usernameSet,
              arena: profile.arena,
            },
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
            transport.send({
              type: 'profile',
              profile: {
                userId: profile.id,
                displayName: profile.displayName,
                trophies: profile.trophies,
                diamonds: profile.diamonds,
                wins: profile.wins,
                losses: profile.losses,
                ownedEmotes: profile.ownedEmotes,
                usernameSet: profile.usernameSet,
                arena: profile.arena,
              },
            });
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
            profile: {
              userId: result.profile.id,
              displayName: result.profile.displayName,
              trophies: result.profile.trophies,
              diamonds: result.profile.diamonds,
              wins: result.profile.wins,
              losses: result.profile.losses,
              ownedEmotes: result.profile.ownedEmotes,
              usernameSet: result.profile.usernameSet,
              arena: result.profile.arena,
            },
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
            profile: {
              userId: result.profile.id,
              displayName: result.profile.displayName,
              trophies: result.profile.trophies,
              diamonds: result.profile.diamonds,
              wins: result.profile.wins,
              losses: result.profile.losses,
              ownedEmotes: result.profile.ownedEmotes,
              usernameSet: result.profile.usernameSet,
              arena: result.profile.arena,
            },
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
            profile: {
              userId: result.profile.id,
              displayName: result.profile.displayName,
              trophies: result.profile.trophies,
              diamonds: result.profile.diamonds,
              wins: result.profile.wins,
              losses: result.profile.losses,
              ownedEmotes: result.profile.ownedEmotes,
              usernameSet: result.profile.usernameSet,
              arena: result.profile.arena,
            },
          });
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
