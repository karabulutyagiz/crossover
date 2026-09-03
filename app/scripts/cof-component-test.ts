// COF Adım 03 — bileşen sistemi sözleşme testi. Bağımlılık EKLEMEZ; saf
// policy/navPolicy modüllerini doğrular (React Native gerektirmez).
//   çalıştır:  cd app && npx --prefix ../server tsx scripts/cof-component-test.ts
import tokens from '../src/cof/01_COF_UI_TOKENS.json';
import { contrastRatio } from '../src/cof/contrast';
import {
  BADGE_SURFACE, BUTTON_HEIGHT, BUTTON_SURFACE, badgeForeground, badgeForegroundDetail, buttonExtrusion,
  buttonForeground, buttonGeometry, cofInputAppearance, cofTabAppearance, COF_INPUT_HEIGHT, CONTROL_BORDER_COLOR,
  labelFitPolicy, LABEL_MIN_FIT_SCALE, MIN_TOUCH, surfaceSecondCue, touchSlopFor,
  type CofBadgeVariant, type CofButtonSize, type CofButtonVariant, type CofInputState, type CofSurfaceVariantName,
} from '../src/cof/policy';
import { cofDetailRestingSpace, cofRootRestingSpace, LEGACY_SCREEN_BOTTOM_PAD, screenBottomPadding } from '../src/cof/navPolicy';

let ok = 0; let fail = 0;
const eq = (n: string, got: unknown, want: unknown) => {
  const p = JSON.stringify(got) === JSON.stringify(want); p ? ok++ : fail++;
  console.log(`${p ? 'OK  ' : 'FAIL'} ${n}: ${JSON.stringify(got)}${p ? '' : ` beklenen ${JSON.stringify(want)}`}`);
};
const atLeast = (n: string, got: number, min: number) => {
  const p = got >= min; p ? ok++ : fail++;
  console.log(`${p ? 'OK  ' : 'FAIL'} ${n}: ${got} ${p ? '≥' : '<'} ${min}`);
};
const C = tokens.color;
const MIN = tokens.accessibility.minimumBodyContrast;

console.log('--- ADIM 02 KAPISI: kök ekranda TAM 24 dp dinlenme boşluğu ---');
for (const sb of [0, 20, 34]) {
  eq(`safeArea ${sb} → kök dinlenme boşluğu`, cofRootRestingSpace(sb), 24);
  eq(`safeArea ${sb} → detay dinlenme boşluğu`, cofDetailRestingSpace(sb), 24);
}
eq('kabuk içinde Screen alt boşluğu 0', screenBottomPadding(true), 0);
eq('kabuk DIŞINDA (maç/soru/sonuç) eski 22 dp KORUNUR', screenBottomPadding(false), LEGACY_SCREEN_BOTTOM_PAD);
eq('eski değer gerçekten 22', LEGACY_SCREEN_BOTTOM_PAD, 22);

console.log('\n--- buton: varyant token eşlemesi ve kontrast ---');
const VARIANTS: CofButtonVariant[] = ['primary', 'secondary', 'reward', 'ghost', 'danger'];
const EXPECT: Record<CofButtonVariant, [string, string]> = {
  primary: [C.brand.primary, C.text.onPrimary],
  secondary: [C.surface.strong, C.text.onSecondary],
  reward: [C.reward.gold, C.text.onGold],
  ghost: [C.background.canvas, C.text.primary],
  danger: [C.semantic.error, C.text.onError],
};
for (const v of VARIANTS) {
  eq(`${v} zemin`, BUTTON_SURFACE[v], EXPECT[v][0]);
  eq(`${v} metin`, buttonForeground(v), EXPECT[v][1]);
  atLeast(`${v} kontrast`, Number(contrastRatio(buttonForeground(v), BUTTON_SURFACE[v]).toFixed(2)), MIN);
}
eq('ikincil kenarlık stroke.control', CONTROL_BORDER_COLOR, C.stroke.control);

console.log('\n--- buton: yükseklik, ekstrüzyon, sabit geometri ---');
eq('yükseklikler 58/50/42', [BUTTON_HEIGHT.primary, BUTTON_HEIGHT.secondary, BUTTON_HEIGHT.compact], [58, 50, 42]);
eq('primary ekstrüzyon 5', buttonExtrusion('primary'), 5);
eq('reward ekstrüzyon 5', buttonExtrusion('reward'), 5);
eq('ghost ekstrüzyonsuz', buttonExtrusion('ghost'), 0);
for (const sz of ['primary', 'secondary', 'compact'] as CofButtonSize[]) {
  for (const v of VARIANTS) {
    const base = buttonGeometry(sz, v, { fullWidth: true });
    for (const st of [{ loading: true }, { disabled: true }, { locked: true }]) {
      const s2 = buttonGeometry(sz, v, { fullWidth: true, ...st });
      eq(`${sz}/${v} ${Object.keys(st)[0]}: toplam yükseklik SABİT`, s2.totalHeight, base.totalHeight);
    }
    const narrow = buttonGeometry(sz, v, { fullWidth: false });
    const narrowLoading = buttonGeometry(sz, v, { fullWidth: false, loading: true });
    eq(`${sz}/${v} dar buton: ön slot her durumda ayrık`, [narrow.reserveLeading, narrowLoading.reserveLeading], [true, true]);
    atLeast(`${sz}/${v} dokunma hedefi`, buttonGeometry(sz, v).touchTarget, MIN_TOUCH);
  }
}

console.log('\n--- etiket sığdırma politikası ---');
eq('ana CTA küçültme YOK', labelFitPolicy('primary'), { numberOfLines: 1, adjustsFontSizeToFit: false });
eq('ikincil taban 0.90', labelFitPolicy('secondary').minimumFontScale, 0.9);
eq('kompakt taban 0.90', labelFitPolicy('compact').minimumFontScale, 0.9);
eq('iki satırda ölçekleme yok', labelFitPolicy('secondary', true), { numberOfLines: 2, adjustsFontSizeToFit: false });
eq('taban sabiti 0.90', LABEL_MIN_FIT_SCALE, 0.9);

console.log('\n--- kart: seçili/kilitli yalnız renkle anlatılmıyor ---');
const SURFACES: CofSurfaceVariantName[] = ['base', 'interactive', 'selected', 'reward', 'premium', 'disabled'];
eq('altı varyant tanımlı', SURFACES.length, 6);
eq('selected ikinci işaret: ikon + etiket', surfaceSecondCue('selected'), { icon: 'checkmark-circle', label: true });
eq('disabled ikinci işaret: kilit ikonu', surfaceSecondCue('disabled'), { icon: 'lock-closed', label: false });
for (const v of ['base', 'interactive', 'reward', 'premium'] as CofSurfaceVariantName[]) {
  eq(`${v}: gereksiz durum ikonu yok`, surfaceSecondCue(v).icon, null);
}

console.log('\n--- segmented tab: üç durum, seçilide ikinci işaret ---');
eq('seçili zemin brand.primaryTint', cofTabAppearance('selected').surface, C.brand.primaryTint);
eq('seçili kenarlık brand.primary', cofTabAppearance('selected').border, C.brand.primary);
eq('seçili metin brand.primary', cofTabAppearance('selected').text, C.brand.primary);
eq('seçili İKİNCİ işaret var', cofTabAppearance('selected').showsSecondCue, true);
eq('pasif metin text.secondary', cofTabAppearance('inactive').text, C.text.secondary);
eq('pasif yüzeysiz (tıklanabilir görünür)', cofTabAppearance('inactive').surface, null);
eq('disabled pasiften FARKLI yüzey', cofTabAppearance('disabled').surface, C.surface.disabled);
eq('disabled metin text.disabled', cofTabAppearance('disabled').text, C.text.disabled);
eq('disabled ikinci işaret var', cofTabAppearance('disabled').showsSecondCue, true);

console.log('\n--- rozet: on-color eşlemesi ve yerel sayı ---');
const BADGES: CofBadgeVariant[] = ['quantity', 'count', 'notification', 'new', 'owned', 'active', 'rarity', 'premium', 'info', 'error', 'streak', 'reward', 'success', 'warning'];
const BADGE_EXPECT: Partial<Record<CofBadgeVariant, string>> = {
  quantity: C.text.onSecondary, count: C.text.onError, notification: C.text.onError, new: C.text.onError,
  owned: C.text.onSuccess, active: C.text.onPrimary, rarity: C.text.onPremium, premium: C.text.onPremium,
  info: C.text.onInfo, error: C.text.onError, streak: C.text.onStreak, reward: C.text.onGold,
  success: C.text.onSuccess, warning: C.text.onWarning,
};
eq('14 semantik tür', BADGES.length, 14);
eq('geriye uyum: count = bildirim (kırmızı), quantity = nötr', [BADGE_SURFACE.count, BADGE_SURFACE.quantity], [C.semantic.error, C.surface.strong]);
for (const v of BADGES) {
  eq(`rozet ${v} ön plan`, badgeForeground(v), BADGE_EXPECT[v]);
  atLeast(`rozet ${v} kontrast`, Number(badgeForegroundDetail(v).ratio.toFixed(2)), MIN);
  eq(`rozet ${v} otomatik beyaz DEĞİL`, badgeForeground(v).toUpperCase() === '#FFFFFF', false);
  eq(`rozet ${v} yüzeyi tanımlı`, typeof BADGE_SURFACE[v], 'string');
}

console.log('\n--- input: beş durum ---');
const STATES: CofInputState[] = ['default', 'focused', 'filled', 'error', 'disabled'];
eq('beş durum', STATES.length, 5);
eq('focus YALNIZ renkle değil — kenarlık kalınlaşır', cofInputAppearance('focused').borderWidth > cofInputAppearance('default').borderWidth, true);
eq('focus kenarlığı stroke.focus', cofInputAppearance('focused').border, C.stroke.focus);
eq('error kenarlığı semantic.error', cofInputAppearance('error').border, C.semantic.error);
eq('error yardım metni semantic.error', cofInputAppearance('error').help, C.semantic.error);
eq('filled kenarlığı stroke.control', cofInputAppearance('filled').border, C.stroke.control);
eq('disabled yüzeyi surface.disabled', cofInputAppearance('disabled').surface, C.surface.disabled);
eq('disabled metni OKUNUR kalır (text.disabled)', cofInputAppearance('disabled').text, C.text.disabled);
for (const st of STATES) {
  const a = cofInputAppearance(st);
  eq(`${st}: placeholder ve metin AYRI renk`, a.placeholder !== a.text || st === 'disabled', true);
}
eq('yükseklik 48-52 aralığı', [COF_INPUT_HEIGHT.compact, COF_INPUT_HEIGHT.default], [48, 52]);
atLeast('input dokunma hedefi', COF_INPUT_HEIGHT.compact, MIN_TOUCH);

console.log('\n--- dokunma hedefleri ---');
eq('token minimum 44', MIN_TOUCH, 44);
eq('22 dp ikon → 11 dp pay ile 44', 22 + touchSlopFor(22) * 2, 44);
eq('16 dp ikon → 14 dp pay ile 44', 16 + touchSlopFor(16) * 2, 44);
eq('44+ boyutta pay 0', touchSlopFor(48), 0);
atLeast('compact buton + pay ≥ 44', BUTTON_HEIGHT.compact + touchSlopFor(BUTTON_HEIGHT.compact) * 2, MIN_TOUCH);

console.log(`\n${fail === 0 ? 'TÜM BİLEŞEN TESTLERİ GEÇTİ' : fail + ' TEST BAŞARISIZ'} (${ok} ok, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
