// End-to-end test for the emote system: buying premium emotes (diamond charge,
// no double-charge, insufficient-funds guard) and relaying emotes to the opponent
// in a match. Drives WS clients against a running server (npm run dev).
// Usage: npx tsx src/cli/emotetest.ts
import { WebSocket } from 'ws';
import { pool } from '../db/pool.ts';
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
  wait<T extends ServerMsg['type']>(type: T, timeoutMs = 8_000): Promise<Extract<ServerMsg, { type: T }>> {
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

let failed = false;
function check(cond: boolean, label: string) {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failed = true;
}

async function main() {
  console.log(`Connecting to ${URL} ...`);
  const A = new Client('A');
  const B = new Client('B');
  await A.open(); await B.open();

  // Register two players, capture their account ids.
  A.send({ type: 'register', name: 'EmoteAli' });
  const aProf = (await A.wait('profile')).profile;
  B.send({ type: 'register', name: 'EmoteVeli' });
  const bProf = (await B.wait('profile')).profile;

  // ---- Purchasing ----
  // New accounts start with 50 diamonds → can't afford 'goal' (150).
  A.send({ type: 'buy_emote', emoteId: 'goal' });
  const errPoor = await A.wait('error');
  check(/elmas/i.test(errPoor.message), `insufficient funds blocked — "${errPoor.message}"`);

  // Top up via DB, then the purchase should go through (buyEmote reads fresh balance).
  await pool.query('UPDATE users SET diamonds = 1000 WHERE id = $1', [aProf.userId]);
  A.send({ type: 'buy_emote', emoteId: 'goal' });
  const bought = await A.wait('emote_purchased');
  check(bought.emoteId === 'goal', 'purchase returns the bought emote id');
  check(bought.profile.diamonds === 850, `diamonds charged (1000-150=850) — got ${bought.profile.diamonds}`);
  check(bought.profile.ownedEmotes.includes('goal'), 'owned_emotes now contains goal');

  // Double-buy must not charge again.
  A.send({ type: 'buy_emote', emoteId: 'goal' });
  const errDup = await A.wait('error');
  check(/sahip/i.test(errDup.message), `double-buy blocked — "${errDup.message}"`);
  const { rows } = await pool.query<{ diamonds: number }>('SELECT diamonds FROM users WHERE id = $1', [aProf.userId]);
  check(rows[0]!.diamonds === 850, `still 850 after double-buy attempt — got ${rows[0]!.diamonds}`);

  // ---- Relaying emotes in a match ----
  A.send({ type: 'create_room', name: 'EmoteAli', userId: aProf.userId });
  const st = await A.wait('room_state');
  const aliPlayerId = st.room.youId;
  B.send({ type: 'join_room', code: st.room.code, name: 'EmoteVeli', userId: bProf.userId });
  await B.wait('room_state');

  // A free emote: opponent receives it with the sender's player id.
  A.send({ type: 'send_emote', emoteId: 'gg' });
  const got = await B.wait('emote');
  check(got.emoteId === 'gg', `opponent received emote — got ${got.emoteId}`);
  check(got.fromId === aliPlayerId, 'emote carries the sender player id');

  // An unknown emote id is ignored (no relay) → wait should time out.
  A.send({ type: 'send_emote', emoteId: 'not_a_real_emote' });
  let ignored = false;
  try { await B.wait('emote', 1200); } catch { ignored = true; }
  check(ignored, 'unknown emote id is not relayed');

  A.close(); B.close();
  await pool.end();
  console.log(failed ? '\n❌ EMOTE TEST FAILED' : '\n✅ EMOTE TEST PASSED');
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => { console.error('emotetest error:', err); process.exitCode = 1; });
