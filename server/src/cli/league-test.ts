// ============================================================================
// HAFTALIK LİG TESTİ — hafta penceresi + terfi/düşme kuralları (saf mantık).
// DB gerektirmez. Çalıştır:  npx tsx src/cli/league-test.ts
// ============================================================================
import {
  LEAGUE_DEMOTE_COUNT, LEAGUE_GROUP_SIZE, LEAGUE_MAX_TIER, LEAGUE_PROMOTE_COUNT,
  tierAfterRank, weekEndsAt, weekKeyFor,
} from '../game/weeklyLeague.ts';

let failed = 0;
function check(cond: unknown, label: string): void {
  if (cond) console.log(`OK ${label}`);
  else { failed += 1; console.error(`FAIL ${label}`); }
}

// ── Hafta penceresi (TR saati, pazartesi 00:00) ─────────────────────────────
// 2026-08-29 Cumartesi 12:00 UTC → o haftanın pazartesisi 2026-08-24.
check(weekKeyFor(new Date('2026-08-29T12:00:00Z')) === '2026-08-24', 'cumartesi → o haftanın pazartesisi');
check(weekKeyFor(new Date('2026-08-24T05:00:00Z')) === '2026-08-24', 'pazartesi sabahı aynı hafta');

// Pazar 23:00 TR (= 20:00 UTC) HÂLÂ eski hafta; pazartesi 00:30 TR (=21:30 UTC
// pazar) ARTIK yeni hafta — dönüş anı TR gece yarısıdır, UTC değil.
check(weekKeyFor(new Date('2026-08-30T20:00:00Z')) === '2026-08-24', 'pazar 23:00 TR → eski hafta');
check(weekKeyFor(new Date('2026-08-30T21:30:00Z')) === '2026-08-31', 'pazartesi 00:30 TR → yeni hafta');

// Bitiş damgası: haftanın sonu, bir sonraki haftanın başlangıcıyla aynı an.
const endsAt = new Date(weekEndsAt('2026-08-24')).getTime();
check(weekKeyFor(new Date(endsAt - 60_000)) === '2026-08-24', 'bitişten 1 dk önce hâlâ o hafta');
check(weekKeyFor(new Date(endsAt + 60_000)) === '2026-08-31', 'bitişten 1 dk sonra yeni hafta');
check(endsAt - new Date(weekEndsAt('2026-08-17')).getTime() === 7 * 86_400_000, 'ardışık haftalar tam 7 gün');

// ── Terfi / düşme bölgeleri ────────────────────────────────────────────────
check(tierAfterRank(1, 1) === 2, '1. sıra yükselir');
check(tierAfterRank(1, LEAGUE_PROMOTE_COUNT) === 2, 'terfi bölgesinin son sırası yükselir');
check(tierAfterRank(1, LEAGUE_PROMOTE_COUNT + 1) === 1, 'terfi bölgesinin bir altı yerinde kalır');
check(tierAfterRank(1, LEAGUE_GROUP_SIZE - LEAGUE_DEMOTE_COUNT) === 1, 'düşme bölgesinin bir üstü yerinde kalır');
check(tierAfterRank(1, LEAGUE_GROUP_SIZE - LEAGUE_DEMOTE_COUNT + 1) === 0, 'düşme bölgesinin ilk sırası düşer');
check(tierAfterRank(1, LEAGUE_GROUP_SIZE) === 0, 'son sıra düşer');

// Tavan ve taban: Şampiyon yukarı çıkamaz, Bronz aşağı düşemez.
check(tierAfterRank(LEAGUE_MAX_TIER, 1) === LEAGUE_MAX_TIER, 'şampiyon kümesinde tavan korunur');
check(tierAfterRank(0, LEAGUE_GROUP_SIZE) === 0, 'bronz kümesinde taban korunur');

// Bölgeler örtüşmemeli: bir sıra hem terfi hem düşme olamaz.
check(LEAGUE_PROMOTE_COUNT < LEAGUE_GROUP_SIZE - LEAGUE_DEMOTE_COUNT, 'terfi ve düşme bölgeleri ayrık');

// Orta bölgedeki her sıra kümesini korumalı.
let stayOk = true;
for (let rank = LEAGUE_PROMOTE_COUNT + 1; rank <= LEAGUE_GROUP_SIZE - LEAGUE_DEMOTE_COUNT; rank++) {
  if (tierAfterRank(2, rank) !== 2) stayOk = false;
}
check(stayOk, 'orta bölgenin tamamı kümede kalır');

console.log(failed ? `\n${failed} TEST BAŞARISIZ` : '\nTÜM LİG TESTLERİ GEÇTİ');
process.exit(failed ? 1 : 0);
