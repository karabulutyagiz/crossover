// End-to-end test for STREAK + PROFILE STATS + 1h token:
//   2 dereceli galibiyet → winStreak 2 (ana ekran alev rozeti eşiği), mağlubiyet
//   → seri sıfır ama bestStreak kalır; get_my_stats mod kırılımını döndürür;
//   xp2x jetonu artık ~1 SAATLİK pencere açar.
// Usage: WS_URL=ws://localhost:8084 npx tsx src/cli/statstest.ts
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
  wait<T extends ServerMsg['type']>(type: T, timeoutMs = 25_000): Promise<Extract<ServerMsg, { type: T }>> {
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

async function playRound(A: Client, B: Client, scorer: 'A' | 'B') {
  await A.wait('pick_phase');
  const gala = await resolveClub(A, 'a', 'Galatasaray');
  const inter = await resolveClub(B, 'b', 'Inter Milan');
  A.send({ type: 'pick_team', clubId: gala });
  B.send({ type: 'pick_team', clubId: inter });
  await A.wait('guess_phase');
  (scorer === 'A' ? A : B).send({ type: 'submit_guess', text: 'Icardi' });
  return A.wait('result');
}

// Her maç TAZE bağlantılarla oynanır (önceki odanın ctx'i find_match'i bloklar).
async function playRankedMatch(aUserId: string, winner: 'A' | 'B') {
  const A = new Client('A');
  const B = new Client('B');
  await A.open(); await B.open();
  A.send({ type: 'register', name: 'StrA', userId: aUserId });
  await A.wait('profile');
  B.send({ type: 'guest' });
  await B.wait('profile');
  A.send({ type: 'find_match', name: 'StrA', userId: aUserId });
  await A.wait('searching');
  B.send({ type: 'find_match', name: 'StrB' });
  await A.wait('room_state'); await B.wait('room_state');
  for (let i = 0; i < 5; i++) {
    const r = await playRound(A, B, winner);
    if (r.matchOver) break;
    await A.wait('countdown');
  }
  const tu = await A.wait('trophy_update');
  A.close(); B.close();
  await sleep(300);
  return tu;
}

async function main() {
  console.log(`Probing ${URL}`);
  const C = new Client('C');
  await C.open();
  C.send({ type: 'guest' });
  const prof = (await C.wait('profile')).profile;
  C.close();
  await sleep(200);

  // ---- SERİ: 2 galibiyet → 2; mağlubiyet → 0, rekor 2 kalır ----
  const t1 = await playRankedMatch(prof.userId, 'A');
  check(t1.winStreak === 1 && t1.bestStreak === 1, `win #1 → streak 1/best 1 — got ${t1.winStreak}/${t1.bestStreak}`);
  const t2 = await playRankedMatch(prof.userId, 'A');
  check(t2.winStreak === 2 && t2.bestStreak === 2, `win #2 → streak 2/best 2 (alev rozeti eşiği) — got ${t2.winStreak}/${t2.bestStreak}`);
  const t3 = await playRankedMatch(prof.userId, 'B');
  check(t3.winStreak === 0 && t3.bestStreak === 2, `loss → streak 0, best stays 2 — got ${t3.winStreak}/${t3.bestStreak}`);

  // ---- MOD İSTATİSTİKLERİ ----
  const S = new Client('S');
  await S.open();
  S.send({ type: 'register', name: 'StrA', userId: prof.userId });
  await S.wait('profile');
  S.send({ type: 'get_my_stats' });
  const stats = await S.wait('my_stats');
  check(stats.bestStreak === 2 && stats.winStreak === 0, `my_stats streak alanları — got ${stats.winStreak}/${stats.bestStreak}`);
  const tt = stats.modes.find((m) => m.mode === 'team-team');
  check(tt?.wins === 2 && tt?.losses === 1, `team-team mod kırılımı 2G/1M — got ${tt?.wins}/${tt?.losses}`);

  // ---- 1 SAATLİK JETON ----
  await pool.query(`UPDATE users SET power_xp2x = 1 WHERE id = $1`, [prof.userId]);
  S.send({ type: 'use_power', powerId: 'xp2x' });
  const used = await S.wait('power_used');
  const untilMs = new Date(used.profile.xpBoostUntil!).getTime() - Date.now();
  check(untilMs > 50 * 60_000 && untilMs < 70 * 60_000, `xp2x penceresi ~1 saat — kalan ${(untilMs / 60000).toFixed(1)} dk`);

  // ---- SERİ GERİ YÜKLEME: kırılan 2'lik seri geri gelir, kayıt tüketilir ----
  await pool.query(`UPDATE users SET power_streak = 1 WHERE id = $1`, [prof.userId]);
  S.send({ type: 'use_power', powerId: 'streak' });
  const restored = await S.wait('power_used');
  check(restored.profile.winStreak === 2 && restored.profile.lostStreak === 0 && (restored.profile.powerStreak ?? 9) === 0,
    `streak restore → seri 2'ye döndü, kayıt tüketildi — got ${restored.profile.winStreak}/${restored.profile.lostStreak}/${restored.profile.powerStreak}`);
  // Kırık seri yokken kullanım engellenir (stok olsa bile)
  await pool.query(`UPDATE users SET power_streak = 1 WHERE id = $1`, [prof.userId]);
  S.send({ type: 'use_power', powerId: 'streak' });
  const eStreak = await S.wait('error');
  check(/kırık|yok/i.test(eStreak.message), `restore without broken streak blocked — "${eStreak.message}"`);

  S.close();
  await closePool();
  console.log(failed ? '\n❌ STATSTEST FAILED' : '\n✅ STATSTEST PASSED');
  process.exitCode = failed ? 1 : 0;
}

main().catch(async (err) => { console.error('statstest error:', err); await closePool().catch(() => {}); process.exitCode = 1; });
