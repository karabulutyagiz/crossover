// ============================================================================
// KULLANICI ADI KURALLARI TESTİ (2026-08-29)
// DB gerektirmez. Çalıştır:  npx tsx src/cli/username-test.ts
// ============================================================================
import { normalizeUsername, validateUsername, USERNAME_MIN, USERNAME_MAX } from '../game/username.ts';

let failed = 0;
function check(cond: unknown, label: string): void {
  if (cond) console.log(`OK ${label}`);
  else { failed += 1; console.error(`FAIL ${label}`); }
}
const ok = (s: string) => validateUsername(s).ok;

// ── Boşluklu ad otomatik düzeltilir (asıl şikâyet) ──────────────────────────
check(normalizeUsername('Muhammed Taha Aksoy') === 'Muhammed_Taha_Aksoy', 'boşluklar alt çizgiye döner');
check(ok('Muhammed Taha Aksoy'), 'boşluklu ad artık REDDEDİLMEZ');
check(normalizeUsername('  ali   veli  ') === 'ali_veli', 'baş/son boşluk ve tekrarlar temizlenir');
check(normalizeUsername('ali.veli-han') === 'ali_veli_han', 'nokta ve tire de alt çizgiye döner');
check(normalizeUsername('__ali__veli__') === 'ali_veli', 'çoklu ve kenar alt çizgiler kırpılır');
check(normalizeUsername('a'.repeat(40)).length === USERNAME_MAX, 'uzun ad üst sınıra kırpılır');

// ── Uzunluk sınırları ───────────────────────────────────────────────────────
check(!ok('njj'), `3 harflik anlamsız ad reddedilir (min ${USERNAME_MIN})`);
check(!ok('abc'), 'üç harf artık yetersiz');
check(ok('muhammed_taha_aksoy'), '19 karakterlik gerçek ad kabul edilir');
check(!ok('a'.repeat(USERNAME_MAX + 5)), 'üst sınırı aşan ad reddedilir');

// ── Anlamsız ad elemesi ─────────────────────────────────────────────────────
check(!ok('njjk'), 'sesli harf içermeyen ad reddedilir');
check(!ok('xzkw'), 'sessiz yığını reddedilir');
check(!ok('aaaa'), 'aynı karakterin üç kez üstüste tekrarı reddedilir');
check(ok('efe_23'), 'sesli içeren normal ad kabul edilir');
check(ok('kaan61'), 'rakamlı normal ad kabul edilir');
check(!ok('123456'), 'yalnız rakamdan oluşan ad reddedilir');

// ── Küfür filtresi ──────────────────────────────────────────────────────────
for (const bad of [
  'sik', 'sikko', 'siktir_git', 'amcik1', 's1kt1r', 'orospu_cocugu', 'fuckboy',
  'yarrak', 'yarrag1', 'gotveren', 'kaltak', 'pezevenk', 'amk', 'aq_lan',
  'oruspu', 'kasar_kadin', 'ibnelik', 'gotos', 'ananisikeyim', 'sokarim',
  'bitch', 'niggaboy', 'pornstar', 'penis', 'hitler_1', 'nazi_tr',
]) {
  check(!ok(bad), `küfür/argo reddedilir: ${bad}`);
}

// RAKAMLA MASKELEME: "s2k" gibi araya rakam sıkıştırılan türevler.
for (const masked of ['s2k', 's3k', 'am2k', 'y4rr4k', 'g0tveren']) {
  check(!ok(masked), `rakamla maskelenmiş küfür reddedilir: ${masked}`);
}

// ── Masum adlar engellenmemeli (yanlış pozitif kontrolü) ────────────────────
// 'am', 'got', 'pic', 'top' gibi kısa kökler YALNIZ birebir yasak: aksi halde
// Amine/Amca/Amir/Gothic/Picasso/Toprak gibi gerçek adlar elenirdi.
for (const name of [
  'ali_veli', 'mert34', 'ayse_nur', 'burak_yilmaz', 'galatasaray', 'fenerbahce',
  'emre_can', 'sinan_07', 'amine', 'amca_kaan', 'amir_han', 'america_efe',
  'picasso', 'toprak', 'topal_osman', 'gokhan', 'malatyaspor', 'salih_efe',
  'bokan_ali',
]) {
  check(ok(name), `masum ad kabul edilir: ${name}`);
}

console.log(failed ? `\n${failed} TEST BAŞARISIZ` : '\nTÜM KULLANICI ADI TESTLERİ GEÇTİ');
process.exit(failed ? 1 : 0);
