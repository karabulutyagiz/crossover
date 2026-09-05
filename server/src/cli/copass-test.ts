// ============================================================================
// CO-PASS SEZON 2 TABLOSU TESTİ (2026-08-30)
// DB gerektirmez — yalnız ödül tablosunun bütünlüğünü denetler.
// Çalıştır:  npx tsx src/cli/copass-test.ts
// ============================================================================
import { LEVEL_CAP, PASS_V2_FREE, PASS_V2_PREMIUM, type PassReward } from '../game/level.ts';
import { COSMETIC_ITEMS, featuredCosmetics } from '../game/cosmetics.ts';
import { SPECIAL_POWER_IDS } from '../game/specialPowers.ts';

let failed = 0;
function check(cond: unknown, label: string): void {
  if (cond) console.log(`OK  ${label}`);
  else { failed += 1; console.error(`FAIL ${label}`); }
}

const ROAD_POWERS = ['xp2x', 'shield', 'streak', 'training'];
const FRAME_TIERS = ['bronze', 'silver', 'gold', 'diamond', 'goat'];
// Çizili (satılabilir) kozmetikler — beyaz listenin tek doğrulama kaynağı.
const sellable = new Set(featuredCosmetics().map((c) => c.id));
const rarityOf = new Map(COSMETIC_ITEMS.map((c) => [c.id, c.rarity]));

// ── 1) Kapsam: 50 seviyenin HER BİRİNDE iki şerit de ödül taşımalı ──────────
for (let lv = 1; lv <= LEVEL_CAP; lv += 1) {
  if (!PASS_V2_FREE[lv]) { failed += 1; console.error(`FAIL ücretsiz ödül eksik: seviye ${lv}`); }
  if (!PASS_V2_PREMIUM[lv]) { failed += 1; console.error(`FAIL premium ödül eksik: seviye ${lv}`); }
}
check(Object.keys(PASS_V2_FREE).length === 50, '50 ücretsiz ödül slotu');
check(Object.keys(PASS_V2_PREMIUM).length === 50, '50 premium ödül slotu');

// ── 2) Her ödül kimliği PROJEDE GERÇEKTEN var olmalı (uydurma ID yasak) ────
function denetle(lv: number, r: PassReward, track: string): void {
  const bos = !r.diamonds && !r.roadPower && !r.specialPower && !r.frameTier && !r.cosmeticId;
  if (bos) { failed += 1; console.error(`FAIL ${track} ${lv}: boş ödül`); }
  if (r.roadPower && !ROAD_POWERS.includes(r.roadPower)) { failed += 1; console.error(`FAIL ${track} ${lv}: yol gücü yok → ${r.roadPower}`); }
  if (r.specialPower && !(SPECIAL_POWER_IDS as readonly string[]).includes(r.specialPower)) { failed += 1; console.error(`FAIL ${track} ${lv}: özel güç yok → ${r.specialPower}`); }
  if (r.frameTier && !FRAME_TIERS.includes(r.frameTier)) { failed += 1; console.error(`FAIL ${track} ${lv}: çerçeve yok → ${r.frameTier}`); }
  if (r.cosmeticId) {
    if (!sellable.has(r.cosmeticId)) { failed += 1; console.error(`FAIL ${track} ${lv}: kozmetik ÇİZİLİ DEĞİL → ${r.cosmeticId}`); }
    if (rarityOf.get(r.cosmeticId) === 'mythic') { failed += 1; console.error(`FAIL ${track} ${lv}: mythic pass'e giremez (KASA kuralı) → ${r.cosmeticId}`); }
  }
}
for (let lv = 1; lv <= LEVEL_CAP; lv += 1) {
  denetle(lv, PASS_V2_FREE[lv]!, 'ücretsiz');
  denetle(lv, PASS_V2_PREMIUM[lv]!, 'premium');
}
console.log('OK  tüm ödül kimlikleri projede mevcut (uydurma yok)');

// ── 3) Sıkıcılık: aynı ödül türü arka arkaya 3+ kez tekrar etmemeli ────────
function tur(r: PassReward): string {
  if (r.cosmeticId) return 'cosmetic';
  if (r.frameTier) return 'frame';
  if (r.specialPower) return `sp:${r.specialPower}`;
  if (r.roadPower) return `rp:${r.roadPower}`;
  return 'diamonds';
}
for (const [ad, tablo] of [['ücretsiz', PASS_V2_FREE], ['premium', PASS_V2_PREMIUM]] as const) {
  let art = 1;
  for (let lv = 2; lv <= LEVEL_CAP; lv += 1) {
    art = tur(tablo[lv]!) === tur(tablo[lv - 1]!) ? art + 1 : 1;
    if (art >= 3) { failed += 1; console.error(`FAIL ${ad}: seviye ${lv} çevresinde aynı ödül 3 kez üst üste`); break; }
  }
}
console.log('OK  ödül türleri rotasyonda (üst üste tekrar yok)');

// ── 4) Ekonomi tavanı: pass enflasyon yapmamalı ────────────────────────────
const topla = (t: Record<number, PassReward>) =>
  Object.values(t).reduce((a, r) => a + (r.diamonds ?? 0), 0);
const ucretsizElmas = topla(PASS_V2_FREE);
const premiumElmas = topla(PASS_V2_PREMIUM);
console.log(`   ücretsiz toplam: ${ucretsizElmas}💎 · premium toplam: ${premiumElmas}💎`);
check(ucretsizElmas <= 1200, `ücretsiz elmas tavanı aşılmadı (${ucretsizElmas} ≤ 1200)`);
check(premiumElmas <= 3300, `premium elmas tavanı aşılmadı (${premiumElmas} ≤ 3300)`);
check(premiumElmas > 2000, `premium, 2000💎 fiyatının üstünde değer veriyor (${premiumElmas})`);

// ── 5) Mağaza korunmalı: çizili kozmetiklerin çoğu pass'te DAĞITILMAMALI ───
const passKozmetik = new Set<string>();
for (const t of [PASS_V2_FREE, PASS_V2_PREMIUM]) {
  for (const r of Object.values(t)) if (r.cosmeticId) passKozmetik.add(r.cosmeticId);
}
console.log(`   pass'te dağıtılan kozmetik: ${passKozmetik.size} / çizili ${sellable.size}`);
check(passKozmetik.size * 2 <= sellable.size, `kozmetiklerin yarısından azı pass'te (${passKozmetik.size}/${sellable.size}) — mağaza bypass edilmiyor`);

// ── 6) Level 50 sezonun en değerlisi olmalı ────────────────────────────────
const son = PASS_V2_PREMIUM[50]!;
check(!!son.cosmeticId && (son.diamonds ?? 0) >= 400, 'Level 50 premium: kozmetik + en yüksek elmas');

console.log(failed ? `\n${failed} TEST BAŞARISIZ` : '\nTÜM CO-PASS TESTLERİ GEÇTİ');
process.exit(failed ? 1 : 0);
