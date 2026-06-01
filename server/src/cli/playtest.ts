// Headless two-player playtest: drives a full round over WebSocket against a
// running server (npm run dev). Verifies room create/join, the phase flow,
// "first to answer locks the round", and verification wiring end-to-end.
//
// Usage: start the server (npm run dev), then: npm run playtest
import { WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../protocol.ts';

const URL = process.env.WS_URL ?? 'ws://localhost:8080';

class Client {
  private ws: WebSocket;
  private buf: ServerMsg[] = [];
  private waiters: { pred: (m: ServerMsg) => boolean; resolve: (m: ServerMsg) => void }[] = [];
  // Build the open promise in the constructor so we never miss an 'open' event
  // that fires before open() is awaited (the socket connects immediately).
  private opened: Promise<void>;
  constructor(private tag: string) {
    this.ws = new WebSocket(URL);
    this.opened = new Promise((res, rej) => {
      this.ws.on('open', () => res());
      this.ws.on('error', rej);
    });
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ServerMsg;
      console.log(`  [${this.tag}] <- ${m.type}`);
      const i = this.waiters.findIndex((w) => w.pred(m));
      if (i >= 0) this.waiters.splice(i, 1)[0]!.resolve(m);
      else this.buf.push(m);
    });
  }
  open(): Promise<void> {
    return this.opened;
  }
  send(msg: ClientMsg): void {
    console.log(`  [${this.tag}] -> ${msg.type}`);
    this.ws.send(JSON.stringify(msg));
  }
  wait<T extends ServerMsg['type']>(type: T, timeoutMs = 10_000): Promise<Extract<ServerMsg, { type: T }>> {
    const pred = (m: ServerMsg) => m.type === type;
    const hit = this.buf.findIndex(pred);
    if (hit >= 0) return Promise.resolve(this.buf.splice(hit, 1)[0] as Extract<ServerMsg, { type: T }>);
    return new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error(`[${this.tag}] timeout waiting for ${type}`)), timeoutMs);
      this.waiters.push({
        pred,
        resolve: (m) => {
          clearTimeout(timer);
          res(m as Extract<ServerMsg, { type: T }>);
        },
      });
    });
  }
  close(): void {
    this.ws.close();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function resolveClub(c: Client, reqId: string, q: string): Promise<{ id: number; name: string }> {
  c.send({ type: 'search_clubs', reqId, q });
  const res = await c.wait('club_results');
  if (!res.clubs[0]) throw new Error(`No club for "${q}"`);
  return res.clubs[0];
}

async function main(): Promise<void> {
  console.log(`Connecting two players to ${URL} ...`);
  const A = new Client('A:Ali');
  const B = new Client('B:Veli');
  await A.open();

  // A creates the room
  A.send({ type: 'create_room', name: 'Ali' });
  const st = await A.wait('room_state');
  const code = st.room.code;
  console.log(`\nRoom code: ${code}\n`);

  // B joins
  await B.open();
  B.send({ type: 'join_room', code, name: 'Veli' });
  await B.wait('room_state');

  // Resolve clubs to pick
  const gala = await resolveClub(A, 'a1', 'Galatasaray');
  const inter = await resolveClub(B, 'b1', 'Inter');
  console.log(`\nA will pick: ${gala.name} | B will pick: ${inter.name}\n`);

  // Host starts -> countdown -> pick phase
  A.send({ type: 'start' });
  await A.wait('pick_phase');
  A.send({ type: 'pick_team', clubId: gala.id });
  B.send({ type: 'pick_team', clubId: inter.id });

  const reveal = await A.wait('reveal_teams');
  console.log(`\nRevealed: ${reveal.teamA.name} + ${reveal.teamB.name}\n`);

  await A.wait('guess_phase');

  // A answers first; B tries right after (should be ignored by the lock)
  A.send({ type: 'submit_guess', text: 'Sneijder' });
  await sleep(50);
  B.send({ type: 'submit_guess', text: 'Drogba' }); // should be too late

  const result = await A.wait('result');
  const r = result.result;
  console.log('\n================ RESULT ================');
  console.log(`answeredBy : ${r.answeredByName}`);
  console.log(`guess      : ${r.guess}`);
  console.log(`correct    : ${r.correct}  (reason: ${r.reason})`);
  console.log(`matched    : ${r.matchedPlayerName}`);
  console.log(`scores     : ${result.players.map((p) => `${p.name}=${p.score}`).join(', ')}`);
  console.log('========================================\n');

  const winnerIsAli = r.answeredByName === 'Ali';
  const aliScore = result.players.find((p) => p.name === 'Ali')?.score ?? 0;
  const pass = r.correct && winnerIsAli && aliScore === 1;
  console.log(pass ? '✅ PLAYTEST PASSED' : '❌ PLAYTEST FAILED');

  A.close();
  B.close();
  process.exitCode = pass ? 0 : 1;
}

main().catch((err) => {
  console.error('Playtest error:', err);
  process.exitCode = 1;
});
