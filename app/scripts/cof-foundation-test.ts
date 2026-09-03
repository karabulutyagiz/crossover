// COF UI Foundation sözleşme testi (Aşama 01.1). Bağımlılık EKLEMEZ; saf
// modülleri (contrast/policy + token JSON) doğrular, React Native gerektirmez.
//   çalıştır:  npx --prefix ../server tsx scripts/cof-foundation-test.ts     (app/ içinden)
import tokens from '../src/cof/01_COF_UI_TOKENS.json';
import { contrastRatio } from '../src/cof/contrast';
import {
  BADGE_SURFACE, BUTTON_SURFACE, badgeForeground, badgeForegroundDetail, buttonForeground, buttonForegroundDetail,
  CONTROL_BORDER_COLOR, DIGIT_CELL_RATIO, labelFitPolicy, LABEL_MIN_FIT_SCALE, resolveColorToken,
  type CofBadgeVariant, type CofButtonVariant,
} from '../src/cof/policy';

let ok = 0; let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const pass = JSON.stringify(got) === JSON.stringify(want);
  pass ? ok++ : fail++;
  console.log(`${pass ? 'OK  ' : 'FAIL'} ${name}: ${JSON.stringify(got)}${pass ? '' : ` beklenen ${JSON.stringify(want)}`}`);
};
const near = (name: string, got: number, want: number, tol = 0.02) => {
  const pass = Math.abs(got - want) <= tol;
  pass ? ok++ : fail++;
  console.log(`${pass ? 'OK  ' : 'FAIL'} ${name}: ${got.toFixed(2)}:1${pass ? '' : ` beklenen ~${want}:1`}`);
};
const atLeast = (name: string, got: number, min: number) => {
  const pass = got >= min;
  pass ? ok++ : fail++;
  console.log(`${pass ? 'OK  ' : 'FAIL'} ${name}: ${got.toFixed(2)}:1 ${pass ? '≥' : '<'} ${min}:1`);
};

console.log('--- kanonik dosya ---');
eq('token sürümü', tokens.version, '1.0.1');
eq('numberLarge.tabularNumbers', tokens.typography.styles.numberLarge.tabularNumbers, false);
eq('numberBehavior.currentFontSupport', tokens.typography.numberBehavior.currentFontSupport, false);
eq('stroke.control tanımlı', tokens.color.stroke.control, '#7089C5');
eq('secondaryBorder = stroke.control', CONTROL_BORDER_COLOR, '#7089C5');

console.log('\n--- brief kontrast hedefleri ---');
near('#091630 / #20C98B (primary)', contrastRatio('#091630', '#20C98B'), 8.37);
near('#7089C5 / #1A2D5F (kontrol sınırı)', contrastRatio('#7089C5', '#1A2D5F'), 3.83);
near('#091630 / #FF5D72 (danger)', contrastRatio('#091630', '#FF5D72'), 6.04);

console.log('\n--- buton ön planı (varyant seçimi) ---');
const BTN_EXPECT: Record<CofButtonVariant, string> = {
  primary: tokens.color.text.onPrimary,      // #091630
  secondary: tokens.color.text.onSecondary,  // #F8FAFF
  reward: tokens.color.text.onGold,          // #18203E
  ghost: tokens.color.text.primary,          // #F8FAFF
  danger: tokens.color.text.onError,         // #091630 (token haritası açık metin diyor; 2.85:1 → red)
};
(Object.keys(BTN_EXPECT) as CofButtonVariant[]).forEach((v) => {
  eq(`buton ${v} ön plan`, buttonForeground(v), BTN_EXPECT[v]);
  atLeast(`buton ${v} kontrast`, contrastRatio(buttonForeground(v), BUTTON_SURFACE[v]), tokens.accessibility.minimumBodyContrast);
});
const d = buttonForegroundDetail('danger');
eq('danger token haritası (beyan)', d.declared, 'text.onSecondary');
eq('danger beyan REDDEDİLDİ (4.5:1 tutmadı)', d.usedFallback, true);
atLeast('danger beyan edilen açık metin ÖLÇÜMÜ', contrastRatio(resolveColorToken('text.onSecondary')!, BUTTON_SURFACE.danger), 0);
console.log(`     not: text.onSecondary/#FF5D72 = ${contrastRatio(resolveColorToken('text.onSecondary')!, BUTTON_SURFACE.danger).toFixed(2)}:1 (4.5 altı → text.onError'a düşüldü)`);

console.log('\n--- rozet ön planı (otomatik beyaz YOK) ---');
const BADGE_EXPECT: Record<CofBadgeVariant, string> = {
  count: tokens.color.text.onError, new: tokens.color.text.onError, error: tokens.color.text.onError,
  reward: tokens.color.text.onGold, premium: tokens.color.text.onPremium, info: tokens.color.text.onInfo,
  success: tokens.color.text.onSuccess, warning: tokens.color.text.onWarning, streak: tokens.color.text.onStreak,
};
(Object.keys(BADGE_EXPECT) as CofBadgeVariant[]).forEach((v) => {
  eq(`rozet ${v} ön plan`, badgeForeground(v), BADGE_EXPECT[v]);
  atLeast(`rozet ${v} kontrast`, badgeForegroundDetail(v).ratio, tokens.accessibility.minimumBodyContrast);
  eq(`rozet ${v} beyaz DEĞİL`, badgeForeground(v).toUpperCase() === '#FFFFFF', false);
});
(Object.keys(BADGE_SURFACE) as CofBadgeVariant[]).forEach((v) => eq(`rozet ${v} yüzeyi tanımlı`, typeof BADGE_SURFACE[v], 'string'));

console.log('\n--- etiket sığdırma politikası ---');
eq('taban 0.90', LABEL_MIN_FIT_SCALE, 0.9);
eq('ana CTA küçültme YOK', labelFitPolicy('primary'), { numberOfLines: 1, adjustsFontSizeToFit: false });
eq('ikincil: tek satır + 0.90 tabanı', labelFitPolicy('secondary'), { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.9 });
eq('kompakt: tek satır + 0.90 tabanı', labelFitPolicy('compact'), { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.9 });
eq('iki satır: küçültme yok', labelFitPolicy('secondary', true), { numberOfLines: 2, adjustsFontSizeToFit: false });
eq('ana CTA iki satır İSTESE DE küçülmez', labelFitPolicy('primary', true), { numberOfLines: 1, adjustsFontSizeToFit: false });
const scales = (['primary', 'secondary', 'compact'] as const).map((s) => labelFitPolicy(s).minimumFontScale).filter((x): x is number => typeof x === 'number');
eq('hiçbir taban 0.90 altında değil', scales.every((x) => x >= 0.9), true);

console.log('\n--- rakam genişliği (tabular yok) ---');
eq('COFDisplay hücre oranı (Poppins-ExtraBold en geniş rakam 691/1000)', DIGIT_CELL_RATIO.COFDisplay, 0.691);
eq('COFUI hücre oranı (Poppins-SemiBold en geniş rakam 661/1000)', DIGIT_CELL_RATIO.COFUI, 0.661);

console.log(`\n${fail === 0 ? 'TÜM COF SÖZLEŞME TESTLERİ GEÇTİ' : fail + ' TEST BAŞARISIZ'} (${ok} ok, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
