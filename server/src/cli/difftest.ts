// Diagnostic: does the SOLO bot actually behave differently per difficulty?
// Measures the bot's answer LATENCY (ms from guess_phase → bot's buzz) and its
// KNOW-RATE (how often it answers at all) for easy / medium / hard.
//
// Usage:
//   WS_URL=ws://localhost:8084 npx tsx src/cli/difftest.ts
//   WS_URL=wss://168-222-180-190.nip.io npx tsx src/cli/difftest.ts
import { WebSocket } from 'ws';
import type { ClientMsg, ServerMsg, Difficulty } from '../protocol.ts';

const URL = process.env.WS_URL ?? 'ws://localhost:8080';
const ROUNDS_PER_DIFF = Number(process.env.ROUNDS ?? 8);
const FAMOUS = ['Barcelona', 'Real Madrid', 'Manchester United', 'Juventus', 'Bayern Munich', 'Chelsea', 'Arsenal', 'Liverpool', 'Inter', 'Milan'];

class Client {
  private ws: WebSocket;
  private buf: ServerMsg[] = [];
  private waiters: { pred: (m: ServerMsg) => boolean; resolve: (m: ServerMsg) => void; timer: NodeJS.Timeout }[] = [];
  private opened: Promise<void>;
  constructor() {
    this.ws = new WebSocket(URL);
    this.opened = new Promise((res, rej) => { this.ws.on('open', () => res()); this.ws.on('error', rej); });
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ServerMsg;
      const i = this.waiters.findIndex((w) => w.pred(m));
      if (i >= 0) { const w = this.waiters.splice(i, 1)[0]!; clearTimeout(w.timer); w.resolve(m); }
      else this.buf.push(m);
    });
  }
  open() { return this.opened; }
  send(msg: ClientMsg) { this.ws.send(JSON.stringify(msg)); }
  /** Wait for a message matching pred; resolves null on timeout (does not throw). */
  wait(pred: (m: ServerMsg) => boolean, timeoutMs: number): Promise<ServerMsg | null> {
    const hit = this.buf.findIndex(pred);
    if (hit >= 0) return Promise.resolve(this.buf.splice(hit, 1)[0]!);
    return new Promise((res) => {
      const timer = setTimeout(() => {
        const i = this.waiters.findIndex((w) => w.timer === timer);
        if (i >= 0) this.waiters.splice(i, 1);
        res(null);
      }, timeoutMs);
      this.waiters.push({ pred, resolve: (m) => res(m), timer });
    });
  }
  drain(type: ServerMsg['type']) { this.buf = this.buf.filter((m) => m.type !== type); }
  close() { try { this.ws.close(); } catch {} }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Sample { delayMs: number | null; correct: boolean | null; reason: string }

async function measureDifficulty(diff: Difficulty): Promise<Sample[]> {
  const samples: Sample[] = [];
  let famIdx = 0;
  while (samples.length < ROUNDS_PER_DIFF) {
    const c = new Client();
    try {
      await c.open();
      c.send({ type: 'guest' });
      const prof = await c.wait((m) => m.type === 'profile', 10_000);
      if (!prof) { c.close(); break; }
      c.send({ type: 'create_solo', name: 'DiffProbe', options: { mode: 'team-team', difficulty: diff } });
      const rs = await c.wait((m) => m.type === 'room_state' || m.type === 'error', 10_000);
      if (!rs || rs.type === 'error') { c.close(); break; }
      c.send({ type: 'start' });

      // Play rounds within this match until it ends or we have enough samples.
      let guard = 0;
      while (samples.length < ROUNDS_PER_DIFF && guard++ < 10) {
        const pick = await c.wait((m) => m.type === 'pick_phase', 25_000);
        if (!pick) break;
        // pick a famous team (rotate to keep rounds playable & non-repeating)
        const q = FAMOUS[famIdx++ % FAMOUS.length]!;
        c.send({ type: 'search_clubs', reqId: 'q', q });
        const cr = await c.wait((m) => m.type === 'club_results', 8_000);
        if (cr && cr.type === 'club_results' && cr.clubs.length) {
          c.send({ type: 'pick_team', clubId: cr.clubs[0]!.id });
        }
        // Either the round becomes playable (guess_phase) or is skipped (result).
        const gp = await c.wait((m) => m.type === 'guess_phase' || m.type === 'result', 20_000);
        if (!gp) break;
        if (gp.type === 'result') {
          samples.push({ delayMs: null, correct: null, reason: `skip:${gp.result.reason}` });
          if (gp.matchOver) break;
          c.send({ type: 'ready' });
          continue;
        }
        // guess_phase: stay silent, time how long until the BOT buzzes.
        // (guess_locked protokolden kaldırıldı: botun doğru cevabı doğrudan
        // `result`, yanlış cevabı `wrong_guess` olarak gelir — ikisi de "buzz".)
        const t0 = Date.now();
        const buzz = await c.wait((m) => m.type === 'result' || m.type === 'wrong_guess', 18_000);
        if (buzz && buzz.type === 'result') {
          samples.push({ delayMs: Date.now() - t0, correct: buzz.result.correct, reason: 'bot_answered' });
          if (buzz.matchOver) break;
          c.send({ type: 'ready' });
        } else if (buzz && buzz.type === 'wrong_guess') {
          const delay = Date.now() - t0;
          // Bot yanlış yazdı; biz sessiz kaldığımız için tur zaman aşımıyla biter.
          const res = await c.wait((m) => m.type === 'result', 35_000);
          const correct = res && res.type === 'result' ? res.result.correct : null;
          samples.push({ delayMs: delay, correct, reason: 'bot_answered' });
          if (res && res.type === 'result' && res.matchOver) break;
          c.send({ type: 'ready' });
        } else {
          // Bot never buzzed in 18s → it didn't know. End the round with a wrong guess.
          samples.push({ delayMs: null, correct: null, reason: 'bot_silent' });
          c.send({ type: 'submit_guess', text: 'zzznobodyxyz' });
          const res = await c.wait((m) => m.type === 'result', 8_000);
          if (res && res.type === 'result' && res.matchOver) break;
          c.send({ type: 'ready' });
        }
      }
    } catch (e) {
      // move on
    } finally {
      c.close();
    }
    await sleep(150);
  }
  return samples;
}

function summarize(diff: Difficulty, s: Sample[]) {
  const answered = s.filter((x) => x.delayMs != null);
  const delays = answered.map((x) => x.delayMs!);
  const silent = s.filter((x) => x.reason === 'bot_silent').length;
  const skips = s.filter((x) => x.reason.startsWith('skip')).length;
  const eligible = s.length - skips; // rounds where bot had a chance to answer
  const knowRate = eligible > 0 ? (answered.length / eligible) : 0;
  const avg = delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : null;
  const min = delays.length ? Math.min(...delays) : null;
  const max = delays.length ? Math.max(...delays) : null;
  const correctRate = answered.length ? answered.filter((x) => x.correct).length / answered.length : 0;
  console.log(`\n=== ${diff.toUpperCase()} ===`);
  console.log(`  rounds: ${s.length} (skipped ${skips}, bot-eligible ${eligible})`);
  console.log(`  bot answered: ${answered.length}/${eligible}  → KNOW-RATE ${(knowRate * 100).toFixed(0)}%   (silent ${silent})`);
  console.log(`  answer delay ms: avg=${avg}  min=${min}  max=${max}`);
  console.log(`  when answered, correct: ${(correctRate * 100).toFixed(0)}%`);
  console.log(`  raw delays: [${delays.join(', ')}]`);
  return { diff, avg, min, max, knowRate, n: answered.length };
}

async function main() {
  console.log(`Probing bot difficulty against ${URL}  (${ROUNDS_PER_DIFF} rounds/diff)\n`);
  const out: any[] = [];
  for (const d of ['easy', 'medium', 'hard'] as Difficulty[]) {
    const s = await measureDifficulty(d);
    out.push(summarize(d, s));
  }
  console.log(`\n──────── VERDICT ────────`);
  const [e, m, h] = out;
  const distinct = (e.avg != null && m.avg != null && h.avg != null);
  console.log(`easy avg ${e.avg}ms / know ${(e.knowRate*100).toFixed(0)}%  |  medium avg ${m.avg}ms / know ${(m.knowRate*100).toFixed(0)}%  |  hard avg ${h.avg}ms / know ${(h.knowRate*100).toFixed(0)}%`);
  if (!distinct) console.log(`(some tiers had no answered rounds — inspect raw output above)`);
  process.exit(0);
}
main().catch((err) => { console.error('difftest error:', err); process.exit(1); });
