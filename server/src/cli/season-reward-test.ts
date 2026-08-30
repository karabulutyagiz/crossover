// ============================================================================
// SEZON KAPANIŞI TESTİ (2026-08-30) — kupa sıfırlama + ödül bantları.
// DB gerektirmez. Çalıştır: npx tsx src/cli/season-reward-test.ts
// Not: bu dosya rank.ts'i de yükler; season.ts ↔ rank.ts döngüsel importunun
// çalışma zamanında sorun ÇIKARMADIĞINI da doğrular (tsc bunu yakalamaz).
// ============================================================================
import { seasonTrophyReset, seasonRewardFor, SEASON_TROPHY_RESET_FLOOR } from '../game/season.ts';
import { getArena } from '../game/rank.ts';
import { isSeasonRewardAvatar, avatarPrice, isFreeAvatar, isAvatar } from '../game/avatars.ts';
import { COSMETIC_ITEMS } from '../game/cosmetics.ts';

let failed = 0;
function check(cond: unknown, label: string): void {
  if (cond) console.log(`OK  ${label}`);
  else { failed += 1; console.error(`FAIL ${label}`); }
}

// ── Döngüsel import canlı mı ────────────────────────────────────────────────
check(typeof getArena(1500).name === 'string', 'rank.ts ↔ season.ts döngüsel importu çalışıyor');

// ── Kupa yumuşak sıfırlama ─────────────────────────────────────────────────
check(seasonTrophyReset(999) === 999, 'eşik altı kupaya DOKUNULMAZ (999)');
check(seasonTrophyReset(0) === 0, 'sıfır kupa değişmez');
check(seasonTrophyReset(SEASON_TROPHY_RESET_FLOOR) === SEASON_TROPHY_RESET_FLOOR, 'tam eşikte değişmez (1000)');
check(seasonTrophyReset(1500) === 1350, '1500 → 1350 (fazlanın %70i kalır)');
check(seasonTrophyReset(4759) === 3631, 'canlı zirve 4759 → 3631');
check(seasonTrophyReset(2377) === 1964, '2377 → 1964');
// Sıralama korunmalı: reset kimseyi kendinden düşük birinin ALTINA indirmemeli
let onceki = -1, sirali = true;
for (const t of [0, 200, 500, 999, 1000, 1500, 2000, 3500, 5000, 8000]) {
  const r = seasonTrophyReset(t);
  if (r < onceki) sirali = false;
  onceki = r;
}
check(sirali, 'sıfırlama sıralamayı bozmuyor (monoton artan)');

// ── Ödül bantları ──────────────────────────────────────────────────────────
const bantlar: [number, number][] = [[0, 25], [199, 25], [200, 50], [499, 50], [500, 100], [999, 100], [1000, 250], [1999, 250], [2000, 500], [3500, 800], [5000, 1200]];
for (const [kupa, elmas] of bantlar) {
  check(seasonRewardFor(kupa).diamonds === elmas, `zirve ${kupa} → ${elmas}💎`);
}

// ── HERKESE avatar, 1000+ için prestij ─────────────────────────────────────
for (const kupa of [0, 200, 500, 1000, 3500, 5000]) {
  if (seasonRewardFor(kupa).avatarId !== 'pp35') { failed += 1; console.error(`FAIL ${kupa}: S1 rozeti eksik`); }
}
console.log('OK  S1 rozeti (pp35) HER banda veriliyor');
check(seasonRewardFor(999).frameTier === null && seasonRewardFor(999).cosmeticId === null, '1000 altı: çerçeve/arena YOK');
check(seasonRewardFor(1000).frameTier === 'season1' && seasonRewardFor(1000).cosmeticId === 'season1_arena', '1000+: çerçeve + arena VAR');
check(seasonRewardFor(5000).frameTier === 'season1', 'en üst bant da aynı çerçeveyi alıyor');

// ── Ödül varlıkları PROJEDE gerçekten tanımlı mı ───────────────────────────
check(isAvatar('pp35'), 'pp35 avatar kataloğunda tanımlı');
check(isSeasonRewardAvatar('pp35'), 'pp35 sezon ödül avatarı olarak işaretli');
check(avatarPrice('pp35') === null, 'pp35 SATILAMAZ (mağaza fiyatı yok)');
check(!isFreeAvatar('pp35'), 'pp35 ücretsiz değil — sahiplik şart (prestij korunur)');
const arena = COSMETIC_ITEMS.find((c) => c.id === 'season1_arena');
check(!!arena, 'season1_arena kozmetik kataloğunda tanımlı');
check(arena?.diamondPrice === 0, 'season1_arena satın alınamaz (fiyatsız — yalnız ödül)');

// ── Ekonomi: canlı dağılıma göre toplam elmas maliyeti ─────────────────────
const canli: [number, number][] = [[780, 100], [148, 300], [54, 700], [27, 1500], [2, 2300], [3, 4000]];
const maliyet = canli.reduce((a, [kisi, ornekKupa]) => a + kisi * seasonRewardFor(ornekKupa).diamonds, 0);
console.log(`   aylık tahmini elmas maliyeti: ${maliyet.toLocaleString('tr-TR')}💎`);
check(maliyet <= 60_000, `elmas musluğu kontrollü (${maliyet} ≤ 60.000)`);

console.log(failed ? `\n${failed} TEST BAŞARISIZ` : '\nTÜM SEZON ÖDÜL TESTLERİ GEÇTİ');
process.exit(failed ? 1 : 0);
