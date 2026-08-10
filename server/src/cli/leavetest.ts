// Regresyon testi (kullanıcı raporu, 2026-08-10): "Hemen Oyna"da tur arası
// (result/waiting_ready) ekranından Çık'a basılınca RAKİP "Hazırsın! Rakip
// bekleniyor…"da takılı kalıyordu. Bu test dereceli (find_match) maçta tam o
// anı kurar: 1. tur biter, B "Hazır"a basar, A leave_match gönderir —
// beklenen: B'ye ANINDA opponent_left{forfeit:true} + trophy_update gitmesi,
// A'ya (soketi açık tutulur) ceza trophy_update(delta<0) gelmesi.
// Kullanım: sunucu ayrı terminalde → WS_URL=ws://localhost:8082 npx tsx src/cli/leavetest.ts
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
  wait<T extends ServerMsg['type']>(type: T, timeoutMs = 20_000): Promise<Extract<ServerMsg, { type: T }>> {
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

  // Kimlik + DERECELİ eşleşme ("Hemen Oyna" yolu — oda kodu DEĞİL).
  A.send({ type: 'register', name: 'LeaveTestA', caps: ['wrongopen'] });
  const aProf = (await A.wait('profile')).profile;
  B.send({ type: 'register', name: 'LeaveTestB', caps: ['wrongopen'] });
  const bProf = (await B.wait('profile')).profile;

  // Terk cezasının 0'a kırpılmaması için A'ya kupa ver (yeni hesap 0 kupada,
  // ceza floor'lanır ve delta=0 görünür — o meşru davranışı test etmiyoruz).
  await pool.query(`UPDATE users SET trophies = 500 WHERE id = $1 OR id = $2`, [aProf.userId, bProf.userId]);

  A.send({ type: 'find_match', name: 'LeaveTestA', userId: aProf.userId });
  B.send({ type: 'find_match', name: 'LeaveTestB', userId: bProf.userId });
  await A.wait('room_state');
  await B.wait('room_state');
  console.log('  eşleşme kuruldu, 1. tur oynanıyor…');

  // 1. turu A kazanır (1-0) → iki taraf da result + waiting_ready görür.
  await A.wait('pick_phase');
  const exclude = new Set<number>();
  const { aId, bId, player } = await freshCrossover(exclude);
  A.send({ type: 'pick_team', clubId: aId });
  B.send({ type: 'pick_team', clubId: bId });
  await A.wait('guess_phase');
  A.send({ type: 'submit_guess', text: player });
  const res = await B.wait('result');
  check(res.matchOver === false, `1. tur bitti, maç sürüyor (matchOver=false) — got ${res.matchOver}`);
  await B.wait('waiting_ready');

  // B "Hazır"a basar → "Hazırsın! Rakip bekleniyor…" ekranındadır.
  B.send({ type: 'ready' });
  await sleep(150);

  // A tur arasında Çık'a basar (istemci leave_match yollar, soketi kısa süre açık tutar).
  A.send({ type: 'leave_match' });

  // BEKLENEN: B ANINDA hükmen bildirimi alır — takılı kalmaz.
  const oppLeft = await Promise.race([
    B.wait('opponent_left', 4_000),
    sleep(3_500).then(() => null),
  ]);
  check(!!oppLeft, 'B opponent_left aldı (rakip bekleniyor ekranında TAKILI KALMADI)');
  check(!!oppLeft && (oppLeft as any).forfeit === true, `opponent_left forfeit bayrağı true — got ${(oppLeft as any)?.forfeit}`);

  // Dereceli maç: kalan oyuncuya galibiyet kupası yazılır.
  const bTrophy = await Promise.race([
    B.wait('trophy_update', 5_000),
    sleep(4_500).then(() => null),
  ]);
  check(!!bTrophy, 'B (kalan) trophy_update aldı');
  check(!!bTrophy && (bTrophy as any).delta > 0, `B kupa KAZANDI (delta>0) — got ${(bTrophy as any)?.delta}`);

  // Terk eden: ceza kupası (istemci soketi 1.2 sn açık tutar — burada da açık).
  const aTrophy = await Promise.race([
    A.wait('trophy_update', 5_000),
    sleep(4_500).then(() => null),
  ]);
  check(!!aTrophy, 'A (terk eden) trophy_update aldı');
  check(!!aTrophy && (aTrophy as any).delta < 0, `A kupa KAYBETTİ (delta<0) — got ${(aTrophy as any)?.delta}`);

  // Temizlik: test kullanıcıları lokal DB'den silinir.
  await pool.query(`DELETE FROM users WHERE display_name IN ('LeaveTestA','LeaveTestB')`);

  A.close(); B.close();
  await closePool();
  console.log(failed ? '\n❌ LEAVETEST FAILED' : '\n✅ LEAVETEST PASSED');
  process.exitCode = failed ? 1 : 0;
}

main().catch(async (err) => { console.error('leavetest error:', err); await closePool().catch(() => {}); process.exitCode = 1; });
