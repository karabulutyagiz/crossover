// Regresyon testi — wrongretry kuralı (kullanıcı isteği 2026-08-11):
// İLK yanlış cevap oyuncuyu YAKMAZ: 5 sn ceza penceresi sonrası BİR hakkı daha
// vardır (wrong_guess.retryAt). Ceza dolmadan gelen deneme 'cooldown' ile
// reddedilir; İKİNCİ yanlış kesin susturur (retryAt'siz wrong_guess + 'burned').
// Kullanım: sunucu ayrı terminalde → WS_URL=ws://localhost:8082 npx tsx src/cli/wrongretrytest.ts
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
  wait<T extends ServerMsg['type']>(type: T, timeoutMs = 20_000, pred?: (m: Extract<ServerMsg, { type: T }>) => boolean): Promise<Extract<ServerMsg, { type: T }>> {
    const match = (m: ServerMsg) => m.type === type && (!pred || pred(m as Extract<ServerMsg, { type: T }>));
    const hit = this.buf.findIndex(match);
    if (hit >= 0) return Promise.resolve(this.buf.splice(hit, 1)[0] as Extract<ServerMsg, { type: T }>);
    return new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error(`[${this.tag}] timeout waiting for ${type}`)), timeoutMs);
      this.waiters.push({ pred: match, resolve: (m) => { clearTimeout(timer); res(m as Extract<ServerMsg, { type: T }>); } });
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
    [[...exclude]],
  );
  const r = rows[0];
  if (!r) throw new Error('freshCrossover: kullanılabilir taze çift kalmadı');
  return { aId: Number(r.a), bId: Number(r.b), player: r.player_name };
}

async function main() {
  console.log(`Connecting to ${URL} ...`);
  const A = new Client('A');
  const B = new Client('B');
  await A.open(); await B.open();

  A.send({ type: 'register', name: 'RetryTestA', caps: ['wrongopen', 'wrongretry'] } as any);
  const aProf = (await A.wait('profile')).profile;
  B.send({ type: 'register', name: 'RetryTestB', caps: ['wrongopen', 'wrongretry'] } as any);
  const bProf = (await B.wait('profile')).profile;

  A.send({ type: 'find_match', name: 'RetryTestA', userId: aProf.userId });
  B.send({ type: 'find_match', name: 'RetryTestB', userId: bProf.userId });
  await A.wait('room_state'); await B.wait('room_state');
  console.log('  eşleşme kuruldu, tur başlıyor…');

  await A.wait('pick_phase');
  const { aId, bId, player } = await freshCrossover(new Set());
  A.send({ type: 'pick_team', clubId: aId });
  B.send({ type: 'pick_team', clubId: bId });
  await A.wait('guess_phase');
  console.log('  tahmin fazı açık — A bilerek YANLIŞ yazıyor…');

  // 1) İlk yanlış: retryAt DOLU gelmeli (yanmadı, 5 sn ceza).
  const t0 = Date.now();
  A.send({ type: 'submit_guess', text: 'zzzznobody' });
  const w1 = await A.wait('wrong_guess', 10_000);
  check(typeof (w1 as any).retryAt === 'number', 'ilk yanlışta retryAt DOLU (ikinci hak tanındı)');
  const retryAt = Number((w1 as any).retryAt ?? 0);
  const delta = retryAt - t0;
  check(delta >= 4_000 && delta <= 7_000, `ceza penceresi ~5 sn — ölçülen ${Math.round(delta)}ms`);

  // 2) Ceza dolmadan deneme: 'cooldown' ile reddedilir.
  A.send({ type: 'submit_guess', text: player });
  const denied = await A.wait('guess_denied', 5_000);
  check((denied as any).reason === 'cooldown', `ceza içinde deneme reddedildi (cooldown) — got ${(denied as any).reason}`);

  // 3) Ceza dolunca İKİNCİ yanlış: retryAt'siz wrong_guess (artık yandı).
  await sleep(Math.max(0, retryAt - Date.now()) + 300);
  A.send({ type: 'submit_guess', text: 'qqqqnobody' });
  const w2 = await A.wait('wrong_guess', 10_000, (m) => (m as any).byName === 'RetryTestA');
  check((w2 as any).retryAt == null, 'ikinci yanlışta retryAt YOK (kesin susturuldu)');
  // Retry yanlışı MAX_WRONG sayacına İŞLEMEZ: iki yanlışa rağmen sayaç 1 kalmalı
  // (ek hak, 3-yanlış maç-kaybı eşiğini hızlandıran bir tuzağa dönüşmesin).
  check((w1 as any).wrongCount === 1 && (w2 as any).wrongCount === 1,
    `retry yanlışı MAX_WRONG'a sayılmadı (w1=${(w1 as any).wrongCount}, w2=${(w2 as any).wrongCount})`);

  // 4) Yanmış oyuncunun denemesi 'burned' ile reddedilir.
  A.send({ type: 'submit_guess', text: player });
  const denied2 = await A.wait('guess_denied', 5_000);
  check((denied2 as any).reason === 'burned', `yanmış oyuncu reddedildi (burned) — got ${(denied2 as any).reason}`);

  // 5) Tur RAKİBE hâlâ açık: B doğru cevapla turu alır.
  B.send({ type: 'submit_guess', text: player });
  const res = await B.wait('result', 10_000);
  const bScore = res.players.find((p) => p.name === 'RetryTestB')?.score ?? 0;
  check(res.result?.correct === true && bScore === 1, `tur rakibe açık kaldı, B doğruyla aldı — B skoru ${bScore}`);

  await pool.query(`DELETE FROM users WHERE display_name IN ('RetryTestA','RetryTestB')`);
  A.close(); B.close();
  await closePool();
  console.log(failed ? '\n❌ WRONGRETRYTEST FAILED' : '\n✅ WRONGRETRYTEST PASSED');
  process.exitCode = failed ? 1 : 0;
}

main().catch(async (err) => { console.error('wrongretrytest error:', err); await closePool().catch(() => {}); process.exitCode = 1; });
