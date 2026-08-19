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

  A.close(); B.close();

  // ── ESKİ İSTEMCİLİ RAKİP (kullanıcı raporu 2026-08-13) ────────────────────
  // Kural eskiden rakibin istemcisi 'wrongopen' bilmiyorsa sessizce KAPANIYOR,
  // yanlış cevap turu kilitliyordu — oyuncuya "bazen çalışıyor bazen
  // çalışmıyor" gibi görünüyordu (kiminle eşleştiğine bağlıydı). Artık tur
  // her hâlükârda açık kalmalı ve eski istemci taze guess_phase ile açılmalı.
  const C = new Client('C'); const D = new Client('D');
  await C.open(); await D.open();
  C.send({ type: 'register', name: 'RetryTestC', caps: ['wrongopen', 'wrongretry'] } as any);
  const cProf = (await C.wait('profile')).profile;
  D.send({ type: 'register', name: 'RetryTestD' } as any); // caps YOK = eski istemci
  const dProf = (await D.wait('profile')).profile;
  await pool.query(`UPDATE users SET trophies = 500 WHERE id = $1 OR id = $2`, [cProf.userId, dProf.userId]);
  C.send({ type: 'find_match', name: 'RetryTestC', userId: cProf.userId });
  D.send({ type: 'find_match', name: 'RetryTestD', userId: dProf.userId });
  await C.wait('room_state'); await D.wait('room_state');
  await C.wait('pick_phase');
  const pair2 = await freshCrossover(new Set());
  C.send({ type: 'pick_team', clubId: pair2.aId });
  D.send({ type: 'pick_team', clubId: pair2.bId });
  await C.wait('guess_phase'); await D.wait('guess_phase');
  console.log('  eski istemcili rakip senaryosu — C yanlış yazıyor…');
  C.send({ type: 'submit_guess', text: 'zzzznobody' });
  // D (eski istemci) turun kapanmasını DEĞİL, yeniden açılmasını görmeli.
  const resync = await Promise.race([
    D.wait('guess_phase', 6_000),
    sleep(5_500).then(() => null),
  ]);
  check(!!resync, 'eski istemcili rakip taze guess_phase aldı (tur KİLİTLENMEDİ)');
  // Ve gerçekten cevaplayabilmeli: doğru cevapla turu alır.
  D.send({ type: 'submit_guess', text: pair2.player });
  const res2 = await Promise.race([
    D.wait('result', 8_000),
    sleep(7_500).then(() => null),
  ]);
  const dScore = res2 ? (res2 as any).players.find((p: any) => p.name === 'RetryTestD')?.score ?? 0 : 0;
  check(!!res2 && (res2 as any).result?.correct === true && dScore === 1,
    `eski istemci yeniden açılan turda cevap verebildi — D skoru ${dScore}`);
  C.close(); D.close();

  // ── ESKİ İSTEMCİLİ YAZAN (kullanıcı raporu 2026-08-19) ────────────────────
  // İkinci hak sunucu tarafında caps'ten bağımsızdır: yazanın istemcisi
  // 'wrongretry' bildirmese de ilk yanlışta 5 sn ceza + BİR hak daha alır
  // (eski davranış caps'siz yazanı YAKIYORDU → göndere basınca aksiyon yok,
  // doğru cevap da 'burned' ile kabul edilmiyordu). Eski istemci arayüzünü
  // yeniden açan taze guess_phase'i de almalı.
  const E = new Client('E'); const F = new Client('F');
  await E.open(); await F.open();
  E.send({ type: 'register', name: 'RetryTestE' } as any); // caps YOK = eski istemci
  const eProf = (await E.wait('profile')).profile;
  F.send({ type: 'register', name: 'RetryTestF', caps: ['wrongopen', 'wrongretry'] } as any);
  const fProf = (await F.wait('profile')).profile;
  await pool.query(`UPDATE users SET trophies = 500 WHERE id = $1 OR id = $2`, [eProf.userId, fProf.userId]);
  E.send({ type: 'find_match', name: 'RetryTestE', userId: eProf.userId });
  F.send({ type: 'find_match', name: 'RetryTestF', userId: fProf.userId });
  await E.wait('room_state'); await F.wait('room_state');
  await E.wait('pick_phase');
  const pair3 = await freshCrossover(new Set());
  E.send({ type: 'pick_team', clubId: pair3.aId });
  F.send({ type: 'pick_team', clubId: pair3.bId });
  await E.wait('guess_phase'); await F.wait('guess_phase');
  console.log('  eski istemcili YAZAN senaryosu — E (caps’siz) yanlış yazıyor…');
  E.send({ type: 'submit_guess', text: 'zzzznobody' });
  const wE = await E.wait('wrong_guess', 10_000);
  check(typeof (wE as any).retryAt === 'number', 'caps’siz yazan ilk yanlışta YANMADI (retryAt DOLU)');
  // E eski istemci: wrong_guess'i anlamaz, arayüzünü açan guess_phase almalı.
  const resyncE = await Promise.race([
    E.wait('guess_phase', 6_000),
    sleep(5_500).then(() => null),
  ]);
  check(!!resyncE, 'caps’siz yazan taze guess_phase aldı (ikinci hak için arayüz açıldı)');
  // Ceza dolunca DOĞRU cevap kabul edilmeli (raporun 2. şikayeti).
  const eRetryAt = Number((wE as any).retryAt ?? 0);
  await sleep(Math.max(0, eRetryAt - Date.now()) + 300);
  E.send({ type: 'submit_guess', text: pair3.player });
  const resE = await Promise.race([
    E.wait('result', 8_000),
    sleep(7_500).then(() => null),
  ]);
  const eScore = resE ? (resE as any).players.find((p: any) => p.name === 'RetryTestE')?.score ?? 0 : 0;
  check(!!resE && (resE as any).result?.correct === true && eScore === 1,
    `caps’siz yazan ceza sonrası DOĞRU cevabıyla turu aldı — E skoru ${eScore}`);
  E.close(); F.close();

  await pool.query(`DELETE FROM users WHERE display_name IN ('RetryTestA','RetryTestB','RetryTestC','RetryTestD','RetryTestE','RetryTestF')`);
  await closePool();
  console.log(failed ? '\n❌ WRONGRETRYTEST FAILED' : '\n✅ WRONGRETRYTEST PASSED');
  process.exitCode = failed ? 1 : 0;
}

main().catch(async (err) => { console.error('wrongretrytest error:', err); await closePool().catch(() => {}); process.exitCode = 1; });
