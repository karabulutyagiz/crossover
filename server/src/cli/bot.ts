// Practice bot — a second player so you can test the game solo.
//
// Usage:
//   1) On the app (simulator/web) create a room and note the 6-char code.
//   2) npm run bot -- <CODE>            (bot joins, picks a random club, stays
//                                        silent during guessing so YOU can answer)
//   3) Back in the app press "Başlat" and play.
//
// Optional behaviour flags (after the code):
//   --guess "Ronaldo"   bot submits this guess after a delay (test losing)
//   --team "Barcelona"  bot always picks this club (default: random big club)
//   --delay 6           seconds the bot waits before guessing (default 8)
import { WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../protocol.ts';

const URL = process.env.WS_URL ?? 'ws://localhost:8080';

const POPULAR = [
  'Real Madrid',
  'Barcelona',
  'Bayern Munich',
  'Manchester United',
  'Liverpool',
  'Juventus',
  'AC Milan',
  'Chelsea',
  'Arsenal',
  'Paris Saint-Germain',
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const code = process.argv[2];
if (!code || code.startsWith('--')) {
  console.error('Usage: npm run bot -- <ROOM_CODE> [--guess "Name"] [--team "Club"] [--delay 8]');
  process.exit(1);
}
const forcedGuess = arg('guess');
const forcedTeam = arg('team');
const delayMs = (Number(arg('delay')) || 8) * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ws = new WebSocket(URL);
let pendingPickReqId: string | null = null;

function send(msg: ClientMsg): void {
  ws.send(JSON.stringify(msg));
}

ws.on('open', () => {
  console.log(`🤖 Bot connecting to room ${code.toUpperCase()} ...`);
  send({ type: 'join_room', code, name: '🤖 Bot' });
});

ws.on('message', (data) => {
  let msg: ServerMsg;
  try {
    msg = JSON.parse(data.toString()) as ServerMsg;
  } catch {
    return;
  }

  switch (msg.type) {
    case 'room_state':
      if (msg.room.players.length >= 2) console.log('🤖 Joined. Waiting for host to start…');
      break;

    case 'pick_phase': {
      const choice = forcedTeam ?? POPULAR[Math.floor(Math.random() * POPULAR.length)]!;
      pendingPickReqId = 'bot-pick';
      console.log(`🤖 Picking team: ${choice}`);
      send({ type: 'search_clubs', reqId: pendingPickReqId, q: choice });
      break;
    }

    case 'club_results':
      if (msg.reqId === pendingPickReqId && msg.clubs[0]) {
        send({ type: 'pick_team', clubId: msg.clubs[0].id });
        pendingPickReqId = null;
      }
      break;

    case 'reveal_teams':
      console.log(`🤖 Teams revealed: ${msg.teamA.name} + ${msg.teamB.name}`);
      break;

    case 'guess_phase':
      if (forcedGuess) {
        void (async () => {
          await sleep(delayMs);
          console.log(`🤖 Guessing "${forcedGuess}" (giving you ${delayMs / 1000}s head start)`);
          send({ type: 'submit_guess', text: forcedGuess });
        })();
      } else {
        console.log('🤖 Staying silent — your turn to answer!');
      }
      break;

    case 'result': {
      const r = msg.result;
      console.log(`📣 Result: ${r.correct ? '✅' : '❌'} by ${r.answeredByName ?? '(timeout)'} — "${r.guess}"`);
      console.log(`   Scores: ${msg.players.map((p) => `${p.name}=${p.score}`).join(', ')}`);
      console.log('🤖 Waiting for next round…\n');
      break;
    }

    case 'opponent_left':
      console.log('🤖 Opponent left. Bye!');
      ws.close();
      process.exit(0);
      break;

    case 'error':
      console.error(`⚠️  ${msg.message}`);
      break;
  }
});

ws.on('close', () => process.exit(0));
ws.on('error', (e) => {
  console.error('Bot connection error:', e.message);
  process.exit(1);
});
