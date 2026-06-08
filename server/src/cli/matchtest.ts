// End-to-end test for: registered names, first-to-3 match, auto-advance between
// rounds, and the rematch request/accept flow. Drives two WS clients against a
// running server (npm run dev). Usage: npx tsx src/cli/matchtest.ts
import { WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../protocol.ts';

const URL = process.env.WS_URL ?? 'ws://localhost:8080';

class Client {
  private ws: WebSocket;
  private buf: ServerMsg[] = [];
  private waiters: { pred: (m: ServerMsg) => boolean; resolve: (m: ServerMsg) => void }[] = [];
  private opened: Promise<void>;
  constructor(private tag: string) {
    this.ws = new WebSocket(URL);
    this.opened = new Promise((res, rej) => {
      this.ws.on('open', () => res());
      this.ws.on('error', rej);
    });
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ServerMsg;
      const i = this.waiters.findIndex((w) => w.pred(m));
      if (i >= 0) this.waiters.splice(i, 1)[0]!.resolve(m);
      else this.buf.push(m);
    });
  }
  open() { return this.opened; }
  send(msg: ClientMsg) { this.ws.send(JSON.stringify(msg)); }
  wait<T extends ServerMsg['type']>(type: T, timeoutMs = 20_000): Promise<Extract<ServerMsg, { type: T }>> {
    const pred = (m: ServerMsg) => m.type === type;
    const hit = this.buf.findIndex(pred);
    if (hit >= 0) return Promise.resolve(this.buf.splice(hit, 1)[0] as Extract<ServerMsg, { type: T }>);
    return new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error(`[${this.tag}] timeout waiting for ${type}`)), timeoutMs);
      this.waiters.push({ pred, resolve: (m) => { clearTimeout(timer); res(m as Extract<ServerMsg, { type: T }>); } });
    });
  }
  close() { this.ws.close(); }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failed = false;
function check(cond: boolean, label: string) {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failed = true;
}

async function resolveClub(c: Client, reqId: string, q: string): Promise<number> {
  c.send({ type: 'search_clubs', reqId, q });
  const res = await c.wait('club_results');
  if (!res.clubs[0]) throw new Error(`No club for "${q}"`);
  return res.clubs[0].id;
}

// Play one round: A picks Galatasaray, B picks Inter, A answers "Sneijder" (correct).
async function playRound(A: Client, B: Client): Promise<Extract<ServerMsg, { type: 'result' }>> {
  await A.wait('pick_phase');
  const gala = await resolveClub(A, 'a', 'Galatasaray');
  const inter = await resolveClub(B, 'b', 'Inter');
  A.send({ type: 'pick_team', clubId: gala });
  B.send({ type: 'pick_team', clubId: inter });
  await A.wait('guess_phase');
  A.send({ type: 'submit_guess', text: 'Sneijder' });
  await sleep(40);
  B.send({ type: 'submit_guess', text: 'zzzznobody' });
  return A.wait('result');
}

async function main() {
  console.log(`Connecting to ${URL} ...`);
  const A = new Client('A');
  const B = new Client('B');
  await A.open(); await B.open();

  // Register names
  A.send({ type: 'register', name: 'Ali' });
  await A.wait('profile');
  B.send({ type: 'register', name: 'Veli' });
  await B.wait('profile');

  // Room code path
  A.send({ type: 'create_room', name: 'Ali' });
  const st = await A.wait('room_state');
  const code = st.room.code;
  B.send({ type: 'join_room', code, name: 'Veli' });
  await B.wait('room_state');

  A.send({ type: 'start' });

  // Play rounds until the match ends (A wins each → first to 3).
  let last: Extract<ServerMsg, { type: 'result' }> | null = null;
  for (let i = 1; i <= 5; i++) {
    const result = await playRound(A, B);
    const names = result.players.map((p) => p.name).sort().join(',');
    console.log(`  round ${i}: scores ${result.players.map((p) => `${p.name}=${p.score}`).join(' ')} matchOver=${result.matchOver}`);
    check(names === 'Ali,Veli', `round ${i}: names are registered (Ali,Veli) — got ${names}`);
    last = result;
    if (result.matchOver) break;
    await A.wait('countdown'); // auto-advance to next round
  }

  check(last!.matchOver === true, 'match ended automatically');
  check(last!.target === 3, 'win target is 3');
  check(last!.winnerName === 'Ali', `winner is Ali — got ${last!.winnerName}`);
  const aliScore = last!.players.find((p) => p.name === 'Ali')?.score ?? 0;
  check(aliScore === 3, `Ali reached 3 — got ${aliScore}`);

  // Rematch: A requests, B should get the request, B accepts → new match.
  A.send({ type: 'play_again' });
  await A.wait('rematch_waiting');
  check(true, 'requester got rematch_waiting');
  const req = await B.wait('rematch_requested');
  check(req.byName === 'Ali', `opponent saw request from Ali — got ${req.byName}`);
  B.send({ type: 'rematch_response', accept: true });
  const cd = await A.wait('countdown');
  check(cd.n >= 1 && cd.n <= 3, 'new match countdown started after accept');
  // Scores reset for the new match (the real proof a fresh match began)
  const fresh = await playRound(A, B);
  const aliFresh = fresh.players.find((p) => p.name === 'Ali')?.score ?? 99;
  check(aliFresh === 1, `scores reset for rematch (Ali=1 after one round) — got ${aliFresh}`);

  A.close(); B.close();
  console.log(failed ? '\n❌ MATCHTEST FAILED' : '\n✅ MATCHTEST PASSED');
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => { console.error('matchtest error:', err); process.exitCode = 1; });
