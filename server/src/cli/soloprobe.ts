// Diagnostic probe for the SOLO (bot) flow: mode honoring, logos, autocorrect.
// Usage: WS_URL=ws://localhost:8084 npx tsx src/cli/soloprobe.ts
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
  wait(pred: (m: ServerMsg) => boolean, timeoutMs = 15_000): Promise<ServerMsg> {
    const hit = this.buf.findIndex(pred);
    if (hit >= 0) return Promise.resolve(this.buf.splice(hit, 1)[0]!);
    return new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error('timeout')), timeoutMs);
      this.waiters.push({ pred, resolve: (m) => { clearTimeout(timer); res(m); } });
    });
  }
  waitType<T extends ServerMsg['type']>(type: T, timeoutMs = 15_000) {
    return this.wait((m) => m.type === type, timeoutMs) as Promise<Extract<ServerMsg, { type: T }>>;
  }
  close() { this.ws.close(); }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function probeMode(mode: 'country-team' | 'letter-team'): Promise<void> {
  const c = new Client();
  await c.open();
  c.send({ type: 'guest' });
  await c.waitType('profile');
  c.send({ type: 'create_solo', name: 'Probe', options: { mode, difficulty: 'medium' } });
  const first = await c.wait((m) => m.type === 'room_state' || m.type === 'error');
  if (first.type === 'error') {
    console.log(`❌ solo ${mode}: REJECTED — "${first.message}"`);
    c.close();
    return;
  }
  c.send({ type: 'start' });
  const pick = await c.waitType('pick_phase', 20_000);
  console.log(`✅ solo ${mode}: room ok, pick role = ${pick.pickRole ?? 'team (default)'}`);
  c.close();
}

async function probeTeamRound(): Promise<void> {
  const c = new Client();
  await c.open();
  c.send({ type: 'guest' });
  await c.waitType('profile');

  c.send({ type: 'create_solo', name: 'Probe', options: { mode: 'team-team', difficulty: 'easy' } });
  await c.waitType('room_state');
  c.send({ type: 'start' });
  await c.waitType('pick_phase', 20_000);
  c.send({ type: 'search_clubs', reqId: 'x', q: 'Galatasaray' });
  const clubs = await c.waitType('club_results');
  const gs = clubs.clubs[0]!;
  console.log(`search "Galatasaray" → ${gs.name}, logoUrl: ${gs.logoUrl ? 'OK' : 'NULL ❌'}`);
  c.send({ type: 'pick_team', clubId: gs.id });
  const reveal = await c.waitType('reveal_teams', 25_000);
  console.log(`reveal: mode=${reveal.mode ?? 'team-team'} | A=${reveal.teamA.name} logo:${reveal.teamA.logoUrl ? 'OK' : 'NULL ❌'} | B=${reveal.teamB.name} logo:${reveal.teamB.logoUrl ? 'OK' : 'NULL ❌'}`);

  // If the round is playable, try a typo guess before the (easy, 9-16s) bot.
  const next = await c.wait((m) => m.type === 'guess_phase' || m.type === 'result', 20_000);
  if (next.type === 'guess_phase') {
    c.send({ type: 'submit_guess', text: 'Snajder' }); // typo for Sneijder
    const res = await c.waitType('result', 20_000);
    console.log(`typo guess "Snajder" → correct=${res.result.correct} autocorrected=${res.result.autocorrected} matched=${res.result.matchedPlayerName} photo:${res.result.matchedPlayerImageUrl ? 'OK' : 'NULL'}`);
  } else if (next.type === 'result') {
    console.log(`round skipped early: reason=${next.result.reason}`);
  }
  c.close();
}

async function main() {
  console.log(`Probing ${URL}`);
  await probeMode('country-team');
  await probeMode('letter-team');
  await probeTeamRound();
  await sleep(200);
  process.exit(0);
}

main().catch((err) => { console.error('probe error:', err); process.exit(1); });
