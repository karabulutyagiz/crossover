// ============================================================================
// GÜNLÜK GÖREV TESTİ — seçim determinizmi + olay eşleşmesi (saf mantık).
// DB gerektirmez. Çalıştır:  npx tsx src/cli/quests-test.ts
// ============================================================================
import { selectQuestsFor } from '../game/dailyQuests.ts';

let failed = 0;
function check(cond: unknown, label: string): void {
  if (cond) console.log(`OK ${label}`);
  else { failed += 1; console.error(`FAIL ${label}`); }
}

const USER = '11111111-2222-3333-4444-555555555555';
const OTHER = '99999999-8888-7777-6666-555555555555';
const DAY = 20_700;

// ── Determinizm: aynı oyuncu + aynı gün = AYNI görevler ─────────────────────
const a = selectQuestsFor(USER, DAY);
const b = selectQuestsFor(USER, DAY);
check(a.length === 3, 'günde 3 görev seçilir');
check(JSON.stringify(a.map((q) => [q.def.id, q.target])) === JSON.stringify(b.map((q) => [q.def.id, q.target])),
  'aynı gün tekrar çağrılınca görevler DEĞİŞMEZ (uygulamayı yeniden açmak yeni görev vermez)');

// Görevler kendi içinde tekrar etmemeli.
check(new Set(a.map((q) => q.def.id)).size === a.length, 'aynı gün aynı görev iki kez gelmez');

// Farklı gün → farklı seçim olabilmeli (en az bir gün içinde değişmeli).
let changed = false;
for (let d = DAY + 1; d < DAY + 8; d++) {
  const next = selectQuestsFor(USER, d);
  if (JSON.stringify(next.map((q) => q.def.id)) !== JSON.stringify(a.map((q) => q.def.id))) { changed = true; break; }
}
check(changed, 'gün değişince görev seti yenilenir');

// Farklı oyuncu → bağımsız seçim (aynı olması şart değil ama hep aynı olmamalı).
let differsAcrossUsers = false;
for (let d = DAY; d < DAY + 8; d++) {
  if (JSON.stringify(selectQuestsFor(OTHER, d).map((q) => q.def.id)) !== JSON.stringify(selectQuestsFor(USER, d).map((q) => q.def.id))) {
    differsAcrossUsers = true; break;
  }
}
check(differsAcrossUsers, 'farklı oyuncular aynı gün farklı görev alabilir');

// ── Hedefler ve ödüller makul ───────────────────────────────────────────────
check(a.every((q) => q.target >= 1 && q.target <= 12), 'hedefler 1-12 bandında (bir günde bitirilebilir)');
check(a.every((q) => q.def.xp > 0), 'her görev XP ödülü taşır');
// EKONOMİ KURALI: görevler ELMAS VERMEZ — seri ödülleri kapatılırken alınan
// karar arkadan delinmesin diye ödül alanı yalnız xp'dir.
check(a.every((q) => !('diamonds' in q.def)), 'görevlerde elmas ödülü YOK');

// ── Olay eşleşmesi ──────────────────────────────────────────────────────────
const all = selectQuestsFor(USER, DAY).map((q) => q.def);
const play = all.find((d) => d.id === 'play_matches');
if (play) {
  check(play.matches({ kind: 'match_played', mode: 'team-team', won: false }) === 1, 'maç oyna: kayıpta da ilerler');
  check(play.matches({ kind: 'correct_answer', count: 3 }) === 0, 'maç oyna: doğru cevap olayından etkilenmez');
}
const win = all.find((d) => d.id === 'win_matches');
if (win) {
  check(win.matches({ kind: 'match_played', mode: 'xox', won: true }) === 1, 'maç kazan: galibiyette ilerler');
  check(win.matches({ kind: 'match_played', mode: 'xox', won: false }) === 0, 'maç kazan: kayıpta ilerlemez');
}
const xox = all.find((d) => d.id === 'play_xox');
if (xox) {
  check(xox.matches({ kind: 'match_played', mode: 'xox', won: false }) === 1, 'XOX görevi: yalnız xox modunda ilerler');
  check(xox.matches({ kind: 'match_played', mode: 'team-team', won: true }) === 0, 'XOX görevi: başka modda ilerlemez');
}

console.log(failed ? `\n${failed} TEST BAŞARISIZ` : '\nTÜM GÖREV TESTLERİ GEÇTİ');
process.exit(failed ? 1 : 0);
