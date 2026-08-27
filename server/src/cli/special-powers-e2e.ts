// ============================================================================
// ÖZEL GÜÇLER UÇTAN UCA (WS) TESTİ — gerçek sunucu + iki gerçek istemci.
// Akışı iki ekran açısından doğrular: kullanım → rakip feedback → etki →
// tur sonucu → geçiş → yeni tur (spec kapanış şartı).
// Kullanım: sunucu çalışırken  WS_URL=ws://localhost:8123 npx tsx src/cli/special-powers-e2e.ts
// ============================================================================
import { WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../protocol.ts';
import { pool, closePool } from '../db/pool.ts';

const URL = process.env.WS_URL ?? 'ws://localhost:8080';
const CAPS = ['wrongopen', 'wrongretry', 'specialpowers'];

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
  wait<T extends ServerMsg['type']>(type: T, timeoutMs = 20_000, extra?: (m: Extract<ServerMsg, { type: T }>) => boolean): Promise<Extract<ServerMsg, { type: T }>> {
    const pred = (m: ServerMsg) => m.type === type && (!extra || extra(m as never));
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
    [[...exclude, -1]],
  );
  const r = rows[0]!;
  return { aId: Number(r.a), bId: Number(r.b), player: r.player_name };
}

async function main(): Promise<void> {
  const A = new Client('A');
  const B = new Client('B');
  await A.open(); await B.open();

  // Misafir hesaplar
  A.send({ type: 'guest', caps: CAPS });
  B.send({ type: 'guest', caps: CAPS });
  const profA = (await A.wait('profile')).profile;
  const profB = (await B.wait('profile')).profile;

  // A'ya envanter + kuşanma (test hazırlığı — normalde mağaza/ödül)
  await pool.query(`UPDATE users SET sp_freeze = 2, equipped_special_power = 'freeze' WHERE id = $1`, [profA.userId]);

  // Oda kur + katıl (dostluk odası — güçler dereceye bağlı değildir)
  A.send({ type: 'create_room', name: 'TesterA', userId: profA.userId, caps: CAPS });
  const roomMsg = await A.wait('room_state');
  const code = roomMsg.room.code;
  B.send({ type: 'join_room', code, name: 'TesterB', userId: profB.userId, caps: CAPS });
  await B.wait('room_state');
  await sleep(200);
  A.send({ type: 'start' });

  // Maç başı: A kendi güç durumunu SUNUCUDAN alır (snapshot)
  const spState = await A.wait('special_power_state', 25_000);
  check(spState.enabled === true, 'match start: powers enabled for the room');
  check(spState.you.powerId === 'freeze' && spState.you.qty === 2 && spState.you.used === false, 'match start: equipped snapshot (freeze ×2) delivered');

  // İlk tur: iki taraf da GERÇEK bir ortak-oyunculu çift seçer
  await A.wait('pick_phase', 25_000);
  await B.wait('pick_phase', 25_000);
  const used = new Set<number>();
  const cross = await freshCrossover(used);
  used.add(cross.aId); used.add(cross.bId);
  A.send({ type: 'pick_team', clubId: cross.aId });
  B.send({ type: 'pick_team', clubId: cross.bId });
  await A.wait('guess_phase', 25_000);
  await B.wait('guess_phase', 25_000);

  // A Freeze kullanır → İKİ istemci de aynı olayı görür
  A.send({ type: 'use_special_power', powerId: 'freeze', requestId: 'e2e-frz-1' });
  const evA = await A.wait('special_power_activated', 8_000);
  const evB = await B.wait('special_power_activated', 8_000);
  check(evA.powerId === 'freeze' && evB.powerId === 'freeze', 'activation broadcast reaches BOTH screens');
  check((evB.effect?.freezeUntil ?? 0) > Date.now(), 'target screen got server freeze deadline');

  // B donmuşken yazamaz — sunucu reddeder
  B.send({ type: 'submit_guess', text: cross.player });
  const denied = await B.wait('guess_denied', 5_000);
  check(denied.reason === 'frozen', 'frozen opponent input rejected server-side');

  // Envanter DB'de atomik düştü + audit yazıldı
  const inv = await pool.query<{ sp_freeze: number }>(`SELECT sp_freeze FROM users WHERE id = $1`, [profA.userId]);
  check(Number(inv.rows[0]?.sp_freeze) === 1, 'DB inventory decremented exactly once (2 → 1)');
  const audit = await pool.query(`SELECT action, before_qty, after_qty FROM special_power_audit WHERE user_id = $1 AND request_id = 'e2e-frz-1'`, [profA.userId]);
  check(audit.rows.length === 1 && audit.rows[0].action === 'consume' && Number(audit.rows[0].before_qty) === 2 && Number(audit.rows[0].after_qty) === 1, 'audit log row written (consume 2→1)');

  // Buz çözülünce B doğru cevabı verebilir → turu B alır (freeze turu bitirmez)
  await sleep(Math.max(0, (evB.effect?.freezeUntil ?? 0) - Date.now()) + 300);
  B.send({ type: 'submit_guess', text: cross.player });
  const res1 = await A.wait('result', 20_000);
  check(res1.result.correct === true, 'after freeze expiry the round plays out normally');
  await B.wait('result', 5_000);

  // İkinci kullanım denemesi (yeni turda bile) → already_used, envanter DEĞİŞMEZ
  A.send({ type: 'ready' }); B.send({ type: 'ready' });
  await A.wait('guess_phase', 30_000);
  await B.wait('guess_phase', 30_000);
  A.send({ type: 'use_special_power', powerId: 'freeze', requestId: 'e2e-frz-2' });
  const den2 = await A.wait('special_power_denied', 8_000);
  check(den2.reason === 'already_used', 'ANA KURAL: second power in the same match rejected');
  const inv2 = await pool.query<{ sp_freeze: number }>(`SELECT sp_freeze FROM users WHERE id = $1`, [profA.userId]);
  check(Number(inv2.rows[0]?.sp_freeze) === 1, 'inventory unchanged after rejection');

  // Temizlik
  await pool.query(`DELETE FROM users WHERE id = ANY($1::text[])`, [[profA.userId, profB.userId]]).catch(() => {});
  A.close(); B.close();
  await closePool();
  console.log(failed ? '\nE2E FAILURES PRESENT' : '\nSPECIAL POWERS E2E PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error('E2E error:', err); process.exit(1); });
