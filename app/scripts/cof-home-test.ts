// COF ADIM 04 — ANA EKRAN YERLEŞİM SÖZLEŞMESİ TESTLERİ
// Çalıştırma: npx --prefix ../server tsx scripts/cof-home-test.ts
// Bu suite JSX ÇİZMEZ; ana ekranın ölçü kararlarını (sütun sayısı, kart
// genişliği, karusel peek'i, arena ilerlemesi, logo bandı) saf fonksiyonlar
// üzerinden doğrular. Ekran görüntüsü bunları GÖSTERİR, test GARANTİ EDER.
import tokens from '../src/cof/01_COF_UI_TOKENS.json';
import {
  HOME_AVATAR_DIAMETER, HOME_CARD_PADDING, HOME_DAILY_BODY_LINES, HOME_DAILY_TITLE_LINES,
  HOME_HEADER_MAX_HELPER_ICONS, HOME_HERO_MAX_H, HOME_HERO_MIN_H, HOME_MIN_TOUCH,
  HOME_DAILY_COLUMNS, HOME_PRIMARY_CTA_COUNT, HOME_SCREEN_HORIZONTAL, HOME_SECTION_GAP, HOME_ZONES,
  homeArenaProgress, homeDailyCardWidth, homeDailyColumns, homeHeroHeight,
  homeMatchOptionCardWidth, homeMatchOptionColumns,
} from '../src/cof/homePolicy';

let ok = 0; let fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got); const w = JSON.stringify(want);
  if (g === w) { ok++; return; }
  fail++; console.error(`FAIL ${name}\n  beklenen ${w}\n  gelen    ${g}`);
}
function truthy(name: string, got: unknown) {
  if (got) { ok++; return; }
  fail++; console.error(`FAIL ${name}: doğru değil (${JSON.stringify(got)})`);
}
function near(name: string, got: number, want: number, tol = 0.51) {
  if (Math.abs(got - want) <= tol) { ok++; return; }
  fail++; console.error(`FAIL ${name}: ${got} ≉ ${want} (±${tol})`);
}

// ── Bölge sırası (spec §4) ────────────────────────────────────────────────
eq('beş bölge, spec sırasıyla', HOME_ZONES, ['playerHeader', 'gameFocus', 'matchOptions', 'progress', 'daily']);
eq('bölge sayısı 5', HOME_ZONES.length, 5);

// ── Üst başlık (spec §5) ──────────────────────────────────────────────────
eq('en fazla iki yardımcı ikon', HOME_HEADER_MAX_HELPER_ICONS, 2);
truthy('avatar çapı 52–56 dp bandında', HOME_AVATAR_DIAMETER >= 52 && HOME_AVATAR_DIAMETER <= 56);

// ── Hero (spec §6) ────────────────────────────────────────────────────────
eq('logo bandı alt sınırı', HOME_HERO_MIN_H, 112);
eq('logo bandı üst sınırı', HOME_HERO_MAX_H, 132);
for (const w of [360, 375, 390, 393, 412, 430]) {
  const h = homeHeroHeight(w);
  truthy(`logo yüksekliği banda kelepçeli (${w} dp → ${h})`, h >= HOME_HERO_MIN_H && h <= HOME_HERO_MAX_H);
}
eq('360 dp logo alt sınıra oturur', homeHeroHeight(360), 115);
eq('430 dp logo üst sınırı aşmaz', homeHeroHeight(430), HOME_HERO_MAX_H);
truthy('logo genişlikle büyür (390 ≥ 360)', homeHeroHeight(390) >= homeHeroHeight(360));

// ── Maç seçenekleri sütunları (spec §7.2 + §11) ───────────────────────────
eq('390 dp normal fontta iki sütun', homeMatchOptionColumns(390, 1), 2);
eq('430 dp normal fontta iki sütun', homeMatchOptionColumns(430, 1), 2);
eq('360 dp SIKIŞTIRMAZ, alt alta alır', homeMatchOptionColumns(360, 1), 1);
eq('%120 fontta alt alta', homeMatchOptionColumns(390, 1.2), 1);
eq('%110 font hâlâ iki sütun', homeMatchOptionColumns(390, 1.1), 2);
eq('360 dp + büyük font yine tek sütun', homeMatchOptionColumns(360, 1.3), 1);

const content390 = 390 - HOME_SCREEN_HORIZONTAL * 2;
eq('390 dp içerik genişliği', content390, 350);
eq('tek sütunda kart tam genişlik', homeMatchOptionCardWidth(content390, 1), 350);
near('iki sütunda kart genişliği', homeMatchOptionCardWidth(content390, 2), (350 - tokens.spacing.cardGap) / 2);
truthy('iki sütun kartı 44 dp dokunma hedefinden geniş', homeMatchOptionCardWidth(content390, 2) >= HOME_MIN_TOUCH);

// ── Günlük alan grid'i (spec §9) ──────────────────────────────────────────
eq('günlük alan iki sütun', HOME_DAILY_COLUMNS, 2);
eq('390 dp iki sütun', homeDailyColumns(390), 2);
eq('360 dp iki sütun', homeDailyColumns(360), 2);
const dailyW390 = homeDailyCardWidth(content390);
near('390 dp günlük kart genişliği', dailyW390, (350 - tokens.spacing.cardGap) / 2);
truthy('yeni kart ESKİ üçe-böl kartından geniş', dailyW390 > (350 - 2 * 8) / 3);
// "GÜNÜN SORUSU" 12 dp Poppins-SemiBold'da ~92 dp; kart iç boşluğu düşülünce
// hâlâ sığmalı — spec §9'un "GÜNÜN SO..." yasağının sayısal karşılığı.
truthy('başlık için kartta ≥100 dp yer kalır', dailyW390 - HOME_CARD_PADDING * 2 >= 100);
for (const w of [360, 390, 430]) {
  const c = w - HOME_SCREEN_HORIZONTAL * 2;
  truthy(`${w} dp: iki kart + aralık içeriğe tam oturur`, homeDailyCardWidth(c) * 2 + tokens.spacing.cardGap <= c + 0.01);
  truthy(`${w} dp: kart başlığa yer bırakır`, homeDailyCardWidth(c) - HOME_CARD_PADDING * 2 >= 100);
}
eq('genişlik ölçülmeden kart 0 (yanıp sönme yok)', homeDailyCardWidth(0), 0);
eq('başlık en fazla iki satır', HOME_DAILY_TITLE_LINES, 2);
eq('açıklama en fazla iki satır', HOME_DAILY_BODY_LINES, 2);

// ── Arena ilerlemesi (spec §8) ────────────────────────────────────────────
eq('74 / 200 açık metni', homeArenaProgress(274, 200, 400).label, '74 / 200');
near('74 / 200 dolum oranı', homeArenaProgress(274, 200, 400).pct, 0.37, 0.001);
eq('arena başında sıfır', homeArenaProgress(200, 200, 400).label, '0 / 200');
eq('arena sonunda dolu', homeArenaProgress(400, 200, 400).pct, 1);
eq('aralık dışına taşmaz', homeArenaProgress(999, 200, 400).earned, 200);
eq('eksiye düşmez', homeArenaProgress(10, 200, 400).earned, 0);
eq('geçersiz aralıkta uydurmaz, dolu sayar', homeArenaProgress(500, 400, 400).pct, 1);
eq('geçersiz aralıkta etiket 0 / 0', homeArenaProgress(500, 400, 400).label, '0 / 0');

// ── Token'a bağlı ölçüler (spec §11) ──────────────────────────────────────
eq('yatay ekran boşluğu token\'dan', HOME_SCREEN_HORIZONTAL, tokens.spacing.screenHorizontal);
truthy('yatay boşluk 16–20 bandında', HOME_SCREEN_HORIZONTAL >= 16 && HOME_SCREEN_HORIZONTAL <= 20);
truthy('bölüm aralığı 24–32 bandında', HOME_SECTION_GAP >= 24 && HOME_SECTION_GAP <= 32);
truthy('kart iç boşluğu 12–16 bandında', HOME_CARD_PADDING >= 12 && HOME_CARD_PADDING <= 16);
eq('dokunma hedefi token\'dan', HOME_MIN_TOUCH, tokens.size.minimumTouchTarget);
eq('tek baskın CTA', HOME_PRIMARY_CTA_COUNT, 1);

if (fail === 0) console.log(`TÜM ANA EKRAN TESTLERİ GEÇTİ (${ok} ok, 0 fail)`);
else { console.error(`\n${fail} TEST BAŞARISIZ (${ok} ok)`); process.exit(1); }
