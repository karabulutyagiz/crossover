// GÜNÜN BULMACASI smoke: gün-paritesi doğru soruyu getiriyor mu + scramble günü
// doğru cevap ödül veriyor mu. LOCAL-ONLY test (DB'ye geçici kullanıcı yazar/siler).
import { createHash, randomUUID } from 'node:crypto';
import { pool } from '../db/pool.ts';
import { getDailyState, submitDailyGuess, istanbulDayIdx, dayResetAt } from '../game/dailyCrossover.ts';
import { buildDailyScramble } from '../game/cozKazan.ts';

const DAY_MS = 86_400_000;

function rngFrom(seedText: string): () => number {
  let counter = 0;
  return () => {
    const h = createHash('sha256').update(`${seedText}:${counter++}`).digest();
    return h.readUInt32BE(0) / 0xffffffff;
  };
}

// dayIdx paritesini istediğimiz değere getiren bir `now` bul (bugünden ileriye tara).
function nowForParity(wantOdd: boolean): number {
  let now = Date.now();
  for (let i = 0; i < 3; i++) {
    if (istanbulDayIdx(now) % 2 === (wantOdd ? 1 : 0)) return now;
    now += DAY_MS;
  }
  return now;
}

async function main() {
  const userId = randomUUID();
  await pool.query(`INSERT INTO users (id, display_name, diamonds) VALUES ($1, 'ScrambleSmoke', 0)`, [userId]);
  let ok = true;
  const log = (m: string) => console.log(m);
  try {
    // ── TEK gün → scramble ──
    const oddNow = nowForParity(true);
    const oddIdx = istanbulDayIdx(oddNow);
    const s1 = await getDailyState(userId, oddNow);
    log(`\n[scramble gün] dayIdx=${oddIdx} kind=${s1?.kind}`);
    if (s1?.kind !== 'scramble') { log('  ✗ kind scramble değil'); ok = false; }
    if (!s1?.scramble?.letters?.length) { log('  ✗ scramble.letters boş'); ok = false; }
    else log(`  ✓ karışık harfler: [${s1.scramble.letters.join(' ')}]`);
    if (s1?.teamA || s1?.teamB) { log('  ✗ scramble gününde teamA/teamB dolu'); ok = false; }

    // aynı seed'le cevabı türet, DOĞRU gönder → ödül
    const ans = await buildDailyScramble(rngFrom(`cof-daily-scramble:${oddIdx}`));
    if (!ans) { log('  ✗ buildDailyScramble null'); ok = false; }
    else {
      log(`  → cevap (shownForm)='${ans.shownForm}' oyuncu='${ans.playerName}'`);
      const wrong = await submitDailyGuess(userId, 'zzqxwrongname', oddNow);
      log(`  yanlış deneme → ${wrong.kind}${wrong.kind === 'wrong' ? ` (${wrong.attemptsLeft} hak)` : ''}`);
      if (wrong.kind !== 'wrong') { log('  ✗ yanlış cevap "wrong" dönmedi'); ok = false; }
      const good = await submitDailyGuess(userId, ans.shownForm, oddNow);
      log(`  doğru deneme → ${good.kind}${good.kind === 'finished' ? ` ödül=${good.rewardGranted} correct=${good.state.result?.correct}` : ''}`);
      if (good.kind !== 'finished' || good.rewardGranted !== 10) { log('  ✗ doğru cevap ödül vermedi'); ok = false; }
      else log('  ✓ doğru cevap +10 💎');
      const bal = await pool.query<{ diamonds: number }>(`SELECT diamonds FROM users WHERE id=$1`, [userId]);
      if (Number(bal.rows[0]?.diamonds) !== 10) { log(`  ✗ bakiye ${bal.rows[0]?.diamonds} (10 beklendi)`); ok = false; }
    }

    // ── ÇİFT gün → crossover (aynı kullanıcı, farklı gün satırı) ──
    const evenNow = nowForParity(false);
    const evenIdx = istanbulDayIdx(evenNow);
    const s2 = await getDailyState(userId, evenNow);
    log(`\n[crossover gün] dayIdx=${evenIdx} kind=${s2?.kind}`);
    if (s2?.kind !== 'crossover') { log('  ✗ kind crossover değil'); ok = false; }
    if (!s2?.teamA || !s2?.teamB) { log('  ✗ teamA/teamB boş'); ok = false; }
    else log(`  ✓ ${s2.teamA.name} × ${s2.teamB.name}`);
    if (s2?.scramble) { log('  ✗ crossover gününde scramble dolu'); ok = false; }
    log(`  resetAt=${dayResetAt(evenIdx).toISOString()}`);
  } finally {
    await pool.query(`DELETE FROM daily_crossover_results WHERE user_id=$1`, [userId]);
    await pool.query(`DELETE FROM diamond_ledger WHERE user_id=$1`, [userId]).catch(() => {});
    await pool.query(`DELETE FROM users WHERE id=$1`, [userId]);
  }
  log(`\n=== ${ok ? 'GEÇTİ ✓' : 'KALDI ✗'} ===`);
  await pool.end();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
