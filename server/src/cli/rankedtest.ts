// End-to-end test for the RANKED path: two clients meet via find_match and the
// winner DOES receive trophies + XP (friendly rooms are covered by matchtest.ts,
// which asserts the opposite). Usage: npx tsx src/cli/rankedtest.ts
import { WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../protocol.ts';
import { pool, closePool } from '../db/pool.ts';

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

// Round kulüpleri artık MAÇ boyunca tekrar seçilemez (used-teams kısıtı, room.ts)
// — her round'un DB'den taze, ortak-oyunculu bir çift alması gerekir.
async function freshCrossover(exclude: Set<number>): Promise<{ aId: number; bId: number; player: string }> {
  const { rows } = await pool.query<{ a: string; b: string; player_name: string }>(
    `SELECT pc1.club_id AS a, pc2.club_id AS b, p.name AS player_name
       FROM player_clubs pc1
       JOIN player_clubs pc2 ON pc2.player_id = pc1.player_id AND pc2.club_id <> pc1.club_id
       JOIN players p ON p.id = pc1.player_id
       JOIN clubs c1 ON c1.id = pc1.club_id AND c1.is_national = FALSE
       JOIN clubs c2 ON c2.id = pc2.club_id AND c2.is_national = FALSE
      WHERE pc1.club_id <> ALL($1::bigint[]) AND pc2.club_id <> ALL($1::bigint[])
      ORDER BY random() LIMIT 1`,
    [[...exclude]],
  );
  const r = rows[0];
  if (!r) throw new Error('freshCrossover: kullanılabilir taze çift kalmadı');
  return { aId: Number(r.a), bId: Number(r.b), player: r.player_name };
}

async function playRound(A: Client, B: Client, exclude: Set<number>): Promise<Extract<ServerMsg, { type: 'result' }>> {
  await A.wait('pick_phase');
  const { aId, bId, player } = await freshCrossover(exclude);
  exclude.add(aId); exclude.add(bId);
  A.send({ type: 'pick_team', clubId: aId });
  B.send({ type: 'pick_team', clubId: bId });
  await A.wait('guess_phase');
  A.send({ type: 'submit_guess', text: player });
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
  const exclude = new Set<number>();
  for (let i = 1; i <= 5; i++) {
    const result = await playRound(A, B, exclude);
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
  await closePool();
  console.log(failed ? '\n❌ RANKEDTEST FAILED' : '\n✅ RANKEDTEST PASSED');
  process.exitCode = failed ? 1 : 0;
}

main().catch(async (err) => { console.error('rankedtest error:', err); await closePool().catch(() => {}); process.exitCode = 1; });
