// ============================================================================
// TUR ZAMANLAMA TUTARLILIĞI (2026-08-30) — 30 sn → 15 sn geçişinin denetimi.
// DB gerektirmez. Çalıştır: npx tsx src/cli/round-timing-test.ts
//
// Amaç: süre kısaltılınca birbirine bağlı DİĞER zamanlamaların sessizce
// tutarsızlaşmasını yakalamak. Tek başına GUESS_MS düşürmek yetmez; bot cevap
// tavanı, ikinci hak cezası ve grace penceresi de tur içine sığmalıdır.
// ============================================================================
import { botAiConfig } from '../matchmaking/botAiConfig.ts';

let failed = 0;
function check(cond: unknown, label: string): void {
  if (cond) console.log(`OK  ${label}`);
  else { failed += 1; console.error(`FAIL ${label}`); }
}
const int = (n: string, f: number) => {
  const v = Number(process.env[n]);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : f;
};

const GUESS_MS = int('ROUND_GUESS_MS', 15_000);
const GRACE_MS = int('ROUND_GUESS_GRACE_MS', 1_200);
const RETRY_MS = int('WRONG_RETRY_MS', 3_000);
const bot = botAiConfig.timing;

console.log(`tur=${GUESS_MS}ms · grace=${GRACE_MS}ms · ikinci hak cezası=${RETRY_MS}ms\n`);

// ── Bot turu kaçırmamalı ───────────────────────────────────────────────────
check(bot.maxCompleteResponseMs < GUESS_MS,
  `bot en yavaş cevabı tura sığıyor (${bot.maxCompleteResponseMs} < ${GUESS_MS})`);
check(bot.maxCompleteResponseMs <= GUESS_MS * 0.8,
  `bot tavanı turun %80'ini aşmıyor (${bot.maxCompleteResponseMs} ≤ ${Math.round(GUESS_MS * 0.8)})`);
check(bot.maxPassMs < GUESS_MS, `bot pas süresi tura sığıyor (${bot.maxPassMs} < ${GUESS_MS})`);
check(bot.minCompleteResponseMs < bot.maxCompleteResponseMs, 'bot cevap aralığı geçerli (min < max)');
check(bot.minPassMs < bot.maxPassMs, 'bot pas aralığı geçerli (min < max)');

// ── İkinci hak gerçekten kullanılabilir olmalı ─────────────────────────────
// Yanlış cevap turun ortasında geldiğinde: ceza + yeniden yazma payı kalmalı.
const ortaNokta = GUESS_MS / 2;
const cezaSonrasi = ortaNokta - RETRY_MS;
check(cezaSonrasi > 3_000,
  `tur ortasında yanılan oyuncuya ceza sonrası ≥3sn kalıyor (${Math.round(cezaSonrasi)}ms)`);
check(RETRY_MS <= GUESS_MS * 0.25,
  `ikinci hak cezası turun %25'ini aşmıyor (${RETRY_MS} ≤ ${Math.round(GUESS_MS * 0.25)})`);

// ── Grace penceresi: gerçek mobil gecikmeyi kapsamalı, hileye yaramamalı ──
check(GRACE_MS >= 800, `grace tipik mobil RTT'yi kapsıyor (${GRACE_MS} ≥ 800ms)`);
check(GRACE_MS <= 2_000, `grace hile penceresi açmıyor (${GRACE_MS} ≤ 2000ms)`);
check(GRACE_MS < GUESS_MS * 0.15, `grace tur süresine göre küçük (%${(GRACE_MS / GUESS_MS * 100).toFixed(1)})`);

// ── Yeniden açma eşiği (reopenAfterWrong) ─────────────────────────────────
const reopenEsik = Math.max(1_000, Math.round(GUESS_MS * 0.067));
check(reopenEsik >= 1_000 && reopenEsik < GUESS_MS * 0.1,
  `tur yeniden açma eşiği orantılı (${reopenEsik}ms)`);

// ── Gerçek oyuncu verisiyle karşılaştırma (8 saatlik ölçüm) ───────────────
// p50 4472 · p75 8741 · p90 16499 · p95 20976
const p = { p50: 4472, p75: 8741, p90: 16499, p95: 20976 };
const sigan = Object.entries(p).filter(([, ms]) => ms <= GUESS_MS).map(([k]) => k);
console.log(`\n   gerçek cevapların sığdığı dilim: ${sigan.join(', ') || 'YOK'}`);
console.log(`   p90 (${p.p90}ms) ${p.p90 <= GUESS_MS ? 'sığıyor' : 'SIĞMIYOR → oyuncuların ~%10u süreyi kaçırır'}`);
check(p.p75 <= GUESS_MS, `oyuncuların %75'i süreye yetişiyor (p75=${p.p75} ≤ ${GUESS_MS})`);

console.log(failed ? `\n${failed} TEST BAŞARISIZ` : '\nTÜM ZAMANLAMA TESTLERİ GEÇTİ');
process.exit(failed ? 1 : 0);
