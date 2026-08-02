// Ülke-takım tur-atlama hatası regresyonu: veri-güdümlü seçim HER ZAMAN oynanabilir
// kombo üretmeli; hasPlayersCountryTeam ile verifyCountryTeamGuess tutarlı olmalı.
import { pool, closePool } from '../db/pool.ts';
import { pickCountryForClub, pickClubForCountry, hasPlayersCountryTeam, commonPlayersCountryTeam } from '../game/verify.ts';

let failed = false;
const ok = (c: boolean, m: string) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) failed = true; };

async function main() {
  // 1) Bildirilen senaryo: Beşiktaş (114) + Türkiye — oyuncu VAR, atlanmamalı
  const has = await hasPlayersCountryTeam(114, 'Türkiye');
  ok(has, `Beşiktaş + Türkiye oyuncu VAR (hasPlayersCountryTeam) — ${has}`);
  const cps = await commonPlayersCountryTeam(114, 'Türkiye', 3);
  ok(cps.length > 0, `ortak oyuncu listelenir — ${cps.map(p => p.name).slice(0,3).join(', ')}`);
  // eski hatalı değer 'Turkey' hiçbir şeyle eşleşmezdi:
  const hadBug = await hasPlayersCountryTeam(114, 'Turkey');
  ok(!hadBug, `eski 'Turkey' değeri eşleşmez (bu yüzden atlıyordu) — ${hadBug}`);

  // 2) Bot 'country' seçimi: rastgele 40 kulüp için — seçilen milliyet O KULÜPTE oynanabilir OLMALI
  const { rows: clubs } = await pool.query<{ id: string }>(
    `SELECT c.id FROM clubs c WHERE c.is_national=false AND EXISTS (SELECT 1 FROM player_clubs pc JOIN players p ON p.id=pc.player_id WHERE pc.club_id=c.id AND p.nationality IS NOT NULL) ORDER BY random() LIMIT 40`);
  let bad1 = 0;
  for (const c of clubs) {
    const country = await pickCountryForClub(Number(c.id), []);
    const playable = await hasPlayersCountryTeam(Number(c.id), country);
    if (!playable) { bad1++; console.log(`   ⚠ club ${c.id} -> ${country} oynanamaz`); }
  }
  ok(bad1 === 0, `40 kulüp için pickCountryForClub → hepsi oynanabilir (0 hata) — ${bad1} hata`);

  // 3) Bot 'team' seçimi: rastgele 20 milliyet için — seçilen kulüp O MİLLİYETTEN oynanabilir OLMALI
  const { rows: nats } = await pool.query<{ n: string }>(
    `SELECT nationality n FROM players WHERE nationality IS NOT NULL GROUP BY nationality HAVING count(*)>=5 ORDER BY random() LIMIT 20`);
  let bad2 = 0;
  for (const n of nats) {
    const club = await pickClubForCountry(n.n, []);
    if (!club) { bad2++; console.log(`   ⚠ ${n.n} için kulüp bulunamadı`); continue; }
    const playable = await hasPlayersCountryTeam(club.id, n.n);
    if (!playable) { bad2++; console.log(`   ⚠ ${n.n} -> club ${club.id} oynanamaz`); }
  }
  ok(bad2 === 0, `20 milliyet için pickClubForCountry → hepsi oynanabilir (0 hata) — ${bad2} hata`);

  await closePool();
  console.log(failed ? '\n❌ CTPROBE FAILED' : '\n✅ CTPROBE PASSED');
  process.exitCode = failed ? 1 : 0;
}
main().catch(async (e) => { console.error('ctprobe error:', e); await closePool().catch(()=>{}); process.exitCode = 1; });
