// Verifies: when the two picked clubs share no common player, the round is
// skipped ('no_common') with no points, then auto-advances. Needs `npm run dev`.
import { WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../protocol.ts';

const URL = process.env.WS_URL ?? 'ws://localhost:8080';

class Client {
  private ws: WebSocket;
  private buf: ServerMsg[] = [];
  private waiters: { pred: (m: ServerMsg) => boolean; resolve: (m: ServerMsg) => void }[] = [];
  private opened: Promise<void>;
  constructor() {
    this.ws = new WebSocket(URL);
    this.opened = new Promise((res, rej) => { this.ws.on('open', () => res()); this.ws.on('error', rej); });
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
      const timer = setTimeout(() => rej(new Error(`timeout waiting for ${type}`)), timeoutMs);
      this.waiters.push({ pred, resolve: (m) => { clearTimeout(timer); res(m as Extract<ServerMsg, { type: T }>); } });
    });
  }
  close() { this.ws.close(); }
}

async function resolveClub(c: Client, q: string): Promise<number> {
  c.send({ type: 'search_clubs', reqId: 'x', q });
  const res = await c.wait('club_results');
  if (!res.clubs[0]) throw new Error(`No club for "${q}"`);
  return res.clubs[0].id;
}

async function main() {
  const A = new Client(); const B = new Client();
  await A.open(); await B.open();
  A.send({ type: 'create_room', name: 'Ali' });
  const st = await A.wait('room_state');
  B.send({ type: 'join_room', code: st.room.code, name: 'Veli' });
  await B.wait('room_state');
  A.send({ type: 'start' });
  await A.wait('pick_phase');
  const konya = await resolveClub(A, 'Konyaspor');
  const cruz = await resolveClub(B, 'Cruz Azul');
  A.send({ type: 'pick_team', clubId: konya });
  B.send({ type: 'pick_team', clubId: cruz });

  const result = await A.wait('result');
  let ok = true;
  const c = (cond: boolean, label: string) => { console.log(`${cond ? '✅' : '❌'} ${label}`); if (!cond) ok = false; };
  console.log(`teams: ${result.result.teamA.name} + ${result.result.teamB.name}, reason=${result.result.reason}`);
  c(result.result.reason === 'no_common', 'reason is no_common');
  c(result.players.every((p) => p.score === 0), 'no points awarded to anyone');
  c(result.matchOver === false, 'match not over (round skipped)');
  // Auto-advances to the next round
  const cd = await A.wait('countdown');
  c(cd.n >= 1 && cd.n <= 3, 'auto-advanced to next round');

  A.close(); B.close();
  console.log(ok ? '\n✅ NO-COMMON TEST PASSED' : '\n❌ NO-COMMON TEST FAILED');
  process.exitCode = ok ? 0 : 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
