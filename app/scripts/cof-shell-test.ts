// COF Aşama 02 kabuk sözleşmesi testi. Bağımlılık EKLEMEZ; saf navPolicy
// modülünü doğrular (React Native gerektirmez).
//   çalıştır:  cd app && npx --prefix ../server tsx scripts/cof-shell-test.ts
import tokens from '../src/cof/01_COF_UI_TOKENS.json';
import {
  cofDetailContentInset, cofNavAppearance, cofNavStates, cofNavTotalHeight, cofRootContentInset,
  COF_NAV_ORDER, isCofDetailPhase, isCofNavHidden,
} from '../src/cof/navPolicy';

let ok = 0; let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const pass = JSON.stringify(got) === JSON.stringify(want);
  pass ? ok++ : fail++;
  console.log(`${pass ? 'OK  ' : 'FAIL'} ${name}: ${JSON.stringify(got)}${pass ? '' : ` beklenen ${JSON.stringify(want)}`}`);
};

const C = tokens.color;
const NAV = tokens.size.bottomNavigation;

console.log('--- içerik alt boşluğu (76 + safeArea + 24) ---');
eq('safeArea 0  → kök', cofRootContentInset(0), 100);
eq('safeArea 20 → kök', cofRootContentInset(20), 120);
eq('safeArea 34 → kök', cofRootContentInset(34), 134);
eq('safeArea 0  → detay (navigasyon yok)', cofDetailContentInset(0), 24);
eq('safeArea 20 → detay', cofDetailContentInset(20), 44);
eq('safeArea 34 → detay', cofDetailContentInset(34), 58);
eq('negatif inset kırpılır', cofRootContentInset(-10), 100);
eq('bar toplam yüksekliği (0/34)', [cofNavTotalHeight(0), cofNavTotalHeight(34)], [76, 110]);
eq('22 dp taşma yüksekliğe GİRMEZ', cofNavTotalHeight(34) - NAV.centerRise !== cofNavTotalHeight(34) ? cofNavTotalHeight(34) : -1, 110);
eq('kök − detay farkı tam bar gövdesi', cofRootContentInset(34) - cofDetailContentInset(34), NAV.barHeightExcludingSafeArea);

console.log('\n--- beş hedefin aktiflik durumu ---');
eq('sıra korunuyor', [...COF_NAV_ORDER], ['store', 'collection', 'home', 'friends', 'tournaments']);
for (const active of COF_NAV_ORDER) {
  const states = cofNavStates(active);
  eq(`${active}: TEK aktif hedef`, states.filter((x) => x.active).length, 1);
  eq(`${active}: doğru hedef aktif`, states.find((x) => x.active)?.key, active);
  const center = states.find((x) => x.center)!;
  if (active === 'home') {
    eq('Oyun aktif → orta kontrol brand.primary', center.appearance.centerBackground, C.brand.primary);
    eq('Oyun aktif → orta ikon text.onPrimary', center.appearance.icon, C.text.onPrimary);
  } else {
    eq(`${active} aktifken orta kontrol NÖTR`, center.appearance.centerBackground, C.surface.strong);
    eq(`${active} aktifken orta ikon text.secondary`, center.appearance.icon, C.text.secondary);
    eq(`${active} aktifken orta kontrolde çizgi YOK`, center.appearance.rail, null);
    eq(`${active} aktifken orta kontrol yeşil DEĞİL`, center.appearance.centerBackground === C.brand.primary, false);
  }
  const others = states.filter((x) => !x.active && !x.center);
  eq(`${active}: inaktifler text.tertiary`, others.every((x) => x.appearance.icon === C.text.tertiary && x.appearance.label === C.text.tertiary), true);
  eq(`${active}: inaktiflerde yüzey/çizgi yok`, others.every((x) => x.appearance.surface === null && x.appearance.rail === null), true);
}
const activeLook = cofNavAppearance(true, false);
eq('aktif sekme yüzeyi brand.primaryTint', activeLook.surface, C.brand.primaryTint);
eq('aktif sekme çizgisi brand.primary', activeLook.rail, C.brand.primary);
eq('aktif sekme ikon/etiket brand.primary', [activeLook.icon, activeLook.label], [C.brand.primary, C.brand.primary]);
eq('aktif çizgi kalınlığı token 3 dp', NAV.activeRailHeight, 3);

console.log('\n--- detay sayfası ve klavye görünürlüğü ---');
for (const p of ['profile', 'arenas', 'leaderboard', 'matchHistory']) {
  eq(`${p} detay sayfası`, isCofDetailPhase(p), true);
  eq(`${p}: alt navigasyon GİZLİ`, isCofNavHidden(p, false), true);
}
for (const p of ['home', 'tournaments']) {
  eq(`${p} kök hedef`, isCofDetailPhase(p), false);
  eq(`${p}: alt navigasyon görünür`, isCofNavHidden(p, false), false);
}
eq('klavye açıkken bar gizlenir (kök ekranda)', isCofNavHidden('home', true), true);
eq('klavye kapanınca bar geri gelir', isCofNavHidden('home', false), false);
eq('detay + klavye → yine gizli', isCofNavHidden('profile', true), true);

console.log(`\n${fail === 0 ? 'TÜM KABUK TESTLERİ GEÇTİ' : fail + ' TEST BAŞARISIZ'} (${ok} ok, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
