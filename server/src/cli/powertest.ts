// End-to-end test for the POWERS system (Seviye Yolu güçleri):
//   claim (level 4 → xp2x, level 7 → shield) → use (atomic, double-use blocked)
//   → ranked match with 2x XP (gained doubled, boosted flag)
//   → armed shield is consumed by the next ranked match; if that match is a loss,
//     delta 0 + shielded flag are emitted.
// Needs a running server (WS_URL) + direct DB access (DATABASE_URL) to set levels.
// Usage: WS_URL=ws://localhost:8084 npx tsx src/cli/powertest.ts
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

// Round kulüpleri artık MAÇ boyunca tekrar seçilemez (used-teams kısıtı, room.ts)
// — her round'un DB'den taze, ortak-oyunculu bir çift alması gerekir; aksi halde
// 2. round Galatasaray/Inter'i tekrar seçmeye çalışır ve sunucu tarafından reddedilir.
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

// One round where `scorer` answers correctly with a taze ortak oyuncu.
async function playRound(A: Client, B: Client, scorer: 'A' | 'B', exclude: Set<number>) {
  await A.wait('pick_phase');
  const { aId, bId, player } = await freshCrossover(exclude);
  exclude.add(aId); exclude.add(bId);
  A.send({ type: 'pick_team', clubId: aId });
  B.send({ type: 'pick_team', clubId: bId });
  await A.wait('guess_phase');
  (scorer === 'A' ? A : B).send({ type: 'submit_guess', text: player });
  return A.wait('result');
}

async function playMatch(A: Client, B: Client, winner: 'A' | 'B') {
  const exclude = new Set<number>();
  for (let i = 0; i < 5; i++) {
    const r = await playRound(A, B, winner, exclude);
    if (r.matchOver) return;
    await A.wait('countdown');
  }
  throw new Error('match did not end in 5 rounds');
}

async function main() {
  console.log(`Probing ${URL}`);
  const A = new Client('A');
  const B = new Client('B');
  await A.open(); await B.open();

  A.send({ type: 'guest' });
  const aProf = (await A.wait('profile')).profile;
  B.send({ type: 'guest' });
  await B.wait('profile');

  // Seviyeyi doğrudan DB'den 15 yap → 5 (xp2x) ve 15 (shield) toplanabilir olsun.
  await pool.query(`UPDATE users SET level = 15 WHERE id = $1`, [aProf.userId]);

  // ---- CLAIM ----
  A.send({ type: 'claim_level_reward', level: 5 });
  const c4 = await A.wait('level_reward_claimed');
  check(c4.powerId === 'xp2x' && c4.diamonds === 50, `level 5 claim grants xp2x +50💎 — got ${c4.powerId}/${c4.diamonds}`);
  check((c4.profile.powerXp2x ?? 0) === 1, `inventory xp2x = 1 — got ${c4.profile.powerXp2x}`);
  A.send({ type: 'claim_level_reward', level: 15 });
  const c7 = await A.wait('level_reward_claimed');
  check(c7.powerId === 'shield' && c7.diamonds === 50, `level 15 claim grants shield +50💎 — got ${c7.powerId}/${c7.diamonds}`);
  check((c7.profile.powerShield ?? 0) === 1, `inventory shield = 1 — got ${c7.profile.powerShield}`);
  // Ara seviyeler artık ödül taşımaz — claim reddedilmeli
  A.send({ type: 'claim_level_reward', level: 7 });
  const eMid = await A.wait('error');
  check(/Geçersiz/i.test(eMid.message), `non-×5 claim rejected — "${eMid.message}"`);

  // ---- USE: xp2x ----
  A.send({ type: 'use_power', powerId: 'xp2x' });
  const u1 = await A.wait('power_used');
  check(u1.powerId === 'xp2x' && (u1.profile.powerXp2x ?? 9) === 0, 'xp2x used — count back to 0');
  check(Boolean(u1.profile.xpBoostUntil), `xpBoostUntil set — ${u1.profile.xpBoostUntil}`);
  A.send({ type: 'use_power', powerId: 'xp2x' });
  const e1 = await A.wait('error');
  check(/aktif|yok/i.test(e1.message), `second xp2x blocked — "${e1.message}"`);

  // ---- USE: shield ----
  A.send({ type: 'use_power', powerId: 'shield' });
  const u2 = await A.wait('power_used');
  check(u2.profile.shieldArmed === true && (u2.profile.powerShield ?? 9) === 0, 'shield armed — count 0');
  A.send({ type: 'use_power', powerId: 'shield' });
  const e2 = await A.wait('error');
  check(/kuşanılı|yok/i.test(e2.message), `second shield blocked — "${e2.message}"`);

  // ---- RANKED WIN with 2x: gained = (40 + 50 ilk galibiyet) × 2 = 180 ----
  // Armed shield is consumed by the first ranked match even when the player wins.
  A.send({ type: 'find_match', name: 'PowA', userId: aProf.userId });
  await A.wait('searching');
  B.send({ type: 'find_match', name: 'PowB' });
  await A.wait('room_state'); await B.wait('room_state');
  await playMatch(A, B, 'A');
  const xpWin = await A.wait('xp_update');
  check(xpWin.boosted === true, 'xp_update carries boosted flag');
  check(xpWin.gained === 180, `boosted first-win XP = 180 — got ${xpWin.gained}`);
  await A.wait('trophy_update');
  const consumedOnWin = await pool.query<{ shield_armed: boolean }>(`SELECT shield_armed FROM users WHERE id = $1`, [aProf.userId]);
  check(consumedOnWin.rows[0]?.shield_armed === false, 'shield consumed after the next ranked match even on win');

  await pool.query(`UPDATE users SET power_shield = power_shield + 1 WHERE id = $1`, [aProf.userId]);

  // ---- RANKED LOSS with armed shield: delta 0 + shielded, sonra kalkan düşer ----
  // İlk maçın odası bağlantı ctx'inde kalır — ikinci maç TAZE bağlantılarla kurulur.
  A.close(); B.close();
  await sleep(400);
  const A2 = new Client('A2');
  const B2 = new Client('B2');
  await A2.open(); await B2.open();
  A2.send({ type: 'register', name: 'PowA', userId: aProf.userId });
  await A2.wait('profile');
  B2.send({ type: 'guest' });
  await B2.wait('profile');
  A2.send({ type: 'use_power', powerId: 'shield' });
  const u3 = await A2.wait('power_used');
  check(u3.profile.shieldArmed === true, 'shield re-armed for loss test');
  A2.send({ type: 'find_match', name: 'PowA', userId: aProf.userId });
  await A2.wait('searching');
  B2.send({ type: 'find_match', name: 'PowB2' });
  await A2.wait('room_state'); await B2.wait('room_state');
  await playMatch(A2, B2, 'B');
  const tu = await A2.wait('trophy_update');
  check(tu.shielded === true, 'loss carries shielded flag');
  check(tu.delta === 0, `shielded loss delta = 0 — got ${tu.delta}`);
  const xpLoss = await A2.wait('xp_update');
  check(xpLoss.gained === 30, `boosted loss XP = 30 — got ${xpLoss.gained}`);
  const { rows } = await pool.query<{ shield_armed: boolean }>(`SELECT shield_armed FROM users WHERE id = $1`, [aProf.userId]);
  check(rows[0]?.shield_armed === false, 'shield disarmed after absorbing the loss');

  // ---- PREMIUM YOL: kilit → yetersiz bakiye → satın alma → claim → tekrarlar ----
  A2.send({ type: 'claim_level_reward', level: 5, track: 'premium' });
  const ePre = await A2.wait('error');
  check(/CO Pass/i.test(ePre.message), `premium claim without unlock blocked — "${ePre.message}"`);
  A2.send({ type: 'buy_premium_road' });
  const ePoor = await A2.wait('error');
  check(/Yetersiz/i.test(ePoor.message), `insufficient purchase blocked — "${ePoor.message}"`);
  await pool.query(`UPDATE users SET diamonds = 3000 WHERE id = $1`, [aProf.userId]);
  A2.send({ type: 'buy_premium_road' });
  const bought = await A2.wait('premium_road_purchased');
  check(bought.profile.premiumRoad === true && bought.profile.diamonds === 1000, `premium purchased, 2000💎 düştü — kalan ${bought.profile.diamonds}`);
  A2.send({ type: 'buy_premium_road' });
  const eTwice = await A2.wait('error');
  check(/zaten/i.test(eTwice.message), `double purchase blocked — "${eTwice.message}"`);
  A2.send({ type: 'claim_level_reward', level: 5, track: 'premium' });
  const pc = await A2.wait('level_reward_claimed');
  check(pc.track === 'premium' && pc.powerId === 'shield' && pc.diamonds === 200, `premium 5 → shield +200💎 — got ${pc.track}/${pc.powerId}/${pc.diamonds}`);
  check((pc.profile.claimedPremium ?? []).includes(5) && (pc.profile.powerShield ?? 0) === 1, 'premium claim kaydı + envanter arttı');
  A2.send({ type: 'claim_level_reward', level: 5, track: 'premium' });
  const eDup = await A2.wait('error');
  check(/toplandı|değil/i.test(eDup.message), `premium double-claim blocked — "${eDup.message}"`);

  // ---- MAĞAZADAN GÜÇ SATIN ALMA ----
  A2.send({ type: 'buy_power', powerId: 'xp2x' });
  const pb = await A2.wait('power_purchased');
  // Premium 5. seviye artık 'shield' veriyor (xp2x değil) — bu xp2x bakiyesi
  // yalnız bu mağaza alımından gelir, 1 olmalı (elmas matematiği değişmedi).
  check(pb.powerId === 'xp2x' && (pb.profile.powerXp2x ?? 0) === 1 && pb.profile.diamonds === 950,
    `store power buy → xp2x x${pb.profile.powerXp2x}, kalan ${pb.profile.diamonds}💎`);

  A2.close(); B2.close();
  await closePool();
  console.log(failed ? '\n❌ POWERTEST FAILED' : '\n✅ POWERTEST PASSED');
  process.exitCode = failed ? 1 : 0;
}

main().catch(async (err) => { console.error('powertest error:', err); await closePool().catch(() => {}); process.exitCode = 1; });
