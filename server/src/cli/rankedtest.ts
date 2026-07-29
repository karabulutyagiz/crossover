// End-to-end test for the RANKED path: two clients meet via find_match and the
// winner DOES receive trophies + XP (friendly rooms are covered by matchtest.ts,
// which asserts the opposite). Usage: npx tsx src/cli/rankedtest.ts
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

async function playRound(A: Client, B: Client): Promise<Extract<ServerMsg, { type: 'result' }>> {
  await A.wait('pick_phase');
  const gala = await resolveClub(A, 'a', 'Galatasaray');
  const inter = await resolveClub(B, 'b', 'Inter Milan');
  A.send({ type: 'pick_team', clubId: gala });
  B.send({ type: 'pick_team', clubId: inter });
  await A.wait('guess_phase');
  A.send({ type: 'submit_guess', text: 'Icardi' });
  await sleep(40);
  B.send({ type: 'submit_guess', text: 'zzzznobody' });
  return A.wait('result');
}

async function main() {
  console.log(`Connecting to ${URL} ...`);
  const A = new Client('A');
  const B = new Client('B');
  await A.open(); await B.open();

  A.send({ type: 'register', name: 'RankA' });
  const aProf = (await A.wait('profile')).profile;
  B.send({ type: 'register', name: 'RankB' });
  await B.wait('profile');

  // Ranked path: both queue via find_match (same mode, ±100 trophies → paired).
  A.send({ type: 'find_match', name: 'RankA', userId: aProf.userId });
  await A.wait('searching');
  B.send({ type: 'find_match', name: 'RankB' });
  await A.wait('room_state');
  await B.wait('room_state');
  check(true, 'matchmade room created via find_match');

  // Play until the match ends (A wins each round → first to 3).
  let last: Extract<ServerMsg, { type: 'result' }> | null = null;
  for (let i = 1; i <= 5; i++) {
    const result = await playRound(A, B);
    console.log(`  round ${i}: scores ${result.players.map((p) => `${p.name}=${p.score}`).join(' ')} matchOver=${result.matchOver}`);
    last = result;
    if (result.matchOver) break;
    await A.wait('countdown');
  }
  check(last!.matchOver === true, 'match ended');

  // Dereceli maç: kupa VE XP yazılmalı.
  const tu = await A.wait('trophy_update');
  check(tu.delta > 0, `winner gained trophies — got ${tu.delta}`);
  const xp = await A.wait('xp_update');
  check(xp.gained > 0, `winner gained XP — got ${xp.gained}`);

  A.close(); B.close();
  console.log(failed ? '\n❌ RANKEDTEST FAILED' : '\n✅ RANKEDTEST PASSED');
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => { console.error('rankedtest error:', err); process.exitCode = 1; });
