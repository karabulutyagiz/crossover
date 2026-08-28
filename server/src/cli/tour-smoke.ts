// Turnuva domain duman testi: 4 kişilik mini turnuva uçtan uca.
import { pool } from '../db/pool.ts';
import { listTournaments, joinTournament, getTournamentState, reportTournamentResult } from '../game/tournaments.ts';

let pass = 0, fail = 0;
function check(c: boolean, msg: string) { if (c) { pass++; console.log('OK', msg); } else { fail++; console.log('FAIL', msg); } }

// 4 sahte kullanıcı + turnuva
const uids: string[] = [];
for (let i = 0; i < 4; i++) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (display_name) VALUES ($1) RETURNING id`, [`tour_smoke_${i}_${Date.now()}`],
  );
  uids.push(rows[0]!.id);
}
const { rows: trows } = await pool.query<{ id: string }>(
  `INSERT INTO tournaments (name, size, prize_first, prize_second, entry_fee) VALUES ('Smoke Kupası', 4, 100, 40, 25) RETURNING id`,
);
// Ücret testleri için herkese 30 elmas ver (biri hariç)
await pool.query(`UPDATE users SET diamonds = 30 WHERE id = ANY($1)`, [uids.slice(0, 3)]);
await pool.query(`UPDATE users SET diamonds = 5 WHERE id = $1`, [uids[3]]);
const tid = trows[0]!.id;

const lst = await listTournaments(uids[0]!);
check(lst.some((x) => x.id === tid && x.status === 'registration'), 'liste: kayıt açık görünür');

for (let i = 0; i < 3; i++) {
  const r = await joinTournament(tid, uids[i]!);
  check(r.ok && !r.started, `katılım ${i + 1}/4 (başlamadı)`);
}
// Ücret kesintisi kontrolü
const { rows: d0 } = await pool.query<{ diamonds: number }>(`SELECT diamonds FROM users WHERE id = $1`, [uids[0]]);
check(d0[0]!.diamonds === 5, 'giriş ücreti 25 kesildi (30→5)');
// Ayrıl → iade
const { leaveTournament } = await import('../game/tournaments.ts');
const lv = await leaveTournament(tid, uids[0]!);
const { rows: d1 } = await pool.query<{ diamonds: number }>(`SELECT diamonds FROM users WHERE id = $1`, [uids[0]]);
check(lv.ok && d1[0]!.diamonds === 30, 'ayrılınca ücret iade (5→30)');
const rj = await joinTournament(tid, uids[0]!);
check(rj.ok, 'yeniden katıldı');
// Elması yetmeyen reddedilir
const poor = await joinTournament(tid, uids[3]!);
check(!poor.ok && (poor.error ?? '').includes('yetersiz'), 'yetersiz elmas reddedildi');
await pool.query(`UPDATE users SET diamonds = 100 WHERE id = $1`, [uids[3]]);
const last = await joinTournament(tid, uids[3]!);
check(last.ok && last.started === true, '4/4 → turnuva BAŞLADI');

let st = (await getTournamentState(tid, uids[0]!))!;
check(st.status === 'live' && st.matches.length === 3, 'ağaç: 2 yarı final + 1 final (3 maç)');
const r1 = st.matches.filter((m) => m.round === 1);
check(r1.every((m) => m.aId && m.bId), '1. tur eşleşmeleri dolu');
check(st.matches.find((m) => m.round === 2)!.aId === null, 'final boş bekliyor');

// Yarı finalleri oynat
const w1 = r1[0]!.aId!;
const res1 = await reportTournamentResult(r1[0]!.id, w1);
check(res1 != null && !res1.finished, 'yf1 sonucu yazıldı');
const w2 = r1[1]!.bId!;
await reportTournamentResult(r1[1]!.id, w2);
st = (await getTournamentState(tid, null))!;
const fin = st.matches.find((m) => m.round === 2)!;
check(fin.aId === w1 && fin.bId === w2, 'kazananlar finale taşındı');

// Çifte rapor korunuyor mu
const dup = await reportTournamentResult(r1[0]!.id, r1[0]!.bId!);
check(dup === null, 'çifte rapor reddedildi');

// Final + ödül
const { rows: before } = await pool.query<{ diamonds: number }>(`SELECT diamonds FROM users WHERE id = $1`, [w1]);
const resF = await reportTournamentResult(fin.id, w1);
check(resF != null && resF.finished && resF.winnerUserId === w1, 'final bitti, şampiyon doğru');
const { rows: after } = await pool.query<{ diamonds: number }>(`SELECT diamonds FROM users WHERE id = $1`, [w1]);
check(after[0]!.diamonds - before[0]!.diamonds === 100, 'şampiyon ödülü +100 yazıldı');
st = (await getTournamentState(tid, null))!;
check(st.status === 'finished' && st.winnerName != null, 'turnuva finished + şampiyon adı');

// Temizlik
await pool.query(`DELETE FROM tournaments WHERE id = $1`, [tid]);
await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [uids]);
console.log(`\nSONUÇ: ${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
