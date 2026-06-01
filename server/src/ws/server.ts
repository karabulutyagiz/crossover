import { createServer, type Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { RoomManager } from '../rooms/manager.ts';
import { BotPlayer } from '../rooms/bot.ts';
import { listScopes } from '../game/verify.ts';
import type { Room, Transport } from '../rooms/room.ts';
import type { ClientMsg, ServerMsg } from '../protocol.ts';

interface ConnCtx {
  room: Room;
  playerId: string;
}

function wsTransport(ws: WebSocket): Transport {
  return {
    isBot: false,
    send: (msg: ServerMsg) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    },
  };
}

export function startServer(port: number): Server {
  const manager = new RoomManager();
  const http = createServer((req, res) => {
    const cors = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
    if (req.url === '/health') {
      res.writeHead(200, cors);
      res.end(JSON.stringify({ ok: true, rooms: manager.count }));
      return;
    }
    if (req.url === '/scopes') {
      listScopes()
        .then((scopes) => {
          res.writeHead(200, cors);
          res.end(JSON.stringify(scopes));
        })
        .catch(() => {
          res.writeHead(500, cors);
          res.end(JSON.stringify({ leagues: [], countries: [] }));
        });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ server: http });

  wss.on('connection', (ws: WebSocket) => {
    let ctx: ConnCtx | null = null;
    const transport = wsTransport(ws);

    ws.on('message', (data) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(data.toString()) as ClientMsg;
      } catch {
        return transport.send({ type: 'error', message: 'Invalid JSON' });
      }

      // First message must establish the connection (create / solo / join).
      if (!ctx) {
        if (msg.type === 'create_room') {
          const room = manager.createRoom();
          if (msg.options?.scope) room.scope = msg.options.scope;
          const res = room.addPlayer(msg.name, transport, true);
          if (res.ok) ctx = { room, playerId: res.id };
          return;
        }
        if (msg.type === 'create_solo') {
          const room = manager.createRoom();
          if (msg.options?.scope) room.scope = msg.options.scope;
          const res = room.addPlayer(msg.name, transport, true);
          if (res.ok) ctx = { room, playerId: res.id };
          const bot = new BotPlayer({ difficulty: msg.options?.difficulty, scope: room.scope });
          const botRes = room.addPlayer('Bot', bot, false);
          if (botRes.ok) bot.bind(room, botRes.id);
          return;
        }
        if (msg.type === 'join_room') {
          const room = manager.get(msg.code);
          if (!room) return transport.send({ type: 'error', message: 'Room not found' });
          const res = room.addPlayer(msg.name, transport, false);
          if (!res.ok) return transport.send({ type: 'error', message: res.error });
          ctx = { room, playerId: res.id };
          return;
        }
        return transport.send({ type: 'error', message: 'Create or join a room first' });
      }

      ctx.room.handle(ctx.playerId, msg);
    });

    ws.on('close', () => {
      if (ctx) ctx.room.handleClose(ctx.playerId);
    });
    ws.on('error', () => {
      if (ctx) ctx.room.handleClose(ctx.playerId);
    });
  });

  http.listen(port, () => {
    console.log(`Crossover server listening on :${port} (ws + /health)`);
  });
  return http;
}
