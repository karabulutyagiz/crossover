// COF yerel biçimleyiciler (Aşama 01). Spec: sayılar `135.480`, tarihler `3 Eyl 2026`.
// Projede ortak yardımcı yoktu; ekranlar `toLocaleString('tr-TR')`i satır içinde
// çağırıyordu. Burada tr-TR DETERMİNİSTİK (Intl'siz) üretilir: Hermes'in Android
// ICU verisi iOS'tan farklı çıktı verebiliyor — iki platformda birebir aynı
// metin için el ile biçimlenir. Diğer diller Intl'e düşer.
import { currentLang } from '../i18n';

const TR_MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'] as const;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function isTr(locale: string): boolean {
  return locale === 'tr' || locale.startsWith('tr-');
}
function activeLocale(): string {
  return currentLang() === 'tr' ? 'tr-TR' : currentLang();
}

/**
 * Yerel-duyarlı BÜYÜK harf. Türkçe'de "i" → "İ"; native textTransform bunu
 * iOS'ta yanlış yapar (KOLEKSIYON), Android'de cihaz yereline bırakır.
 * Tek kapı: tüm COF büyütmeleri buradan geçer.
 */
export function cofUpper(text: string, locale: string = activeLocale()): string {
  try { return text.toLocaleUpperCase(locale); } catch { return text.toUpperCase(); }
}

/**
 * 135480 → "135.480"; 1234.5 → "1.234,5" (tr-TR). Başka dilde Intl.
 * Ondalık basamak `maxFractionDigits` ile sınırlanır (varsayılan 3) — kayan
 * nokta artığı ("0,30000000000000004") ve üstel gösterim ("1e+21") ekrana
 * çıkmaz. Sayı olmayan giriş (sunucu JSON'undan gelen "135480" gibi) sayıya
 * çevrilir; çevrilemeyen ya da sonsuz değerler "0" döner.
 */
export function formatNumber(value: number, locale: string = activeLocale(), maxFractionDigits = 3): string {
  const raw = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(raw)) return '0';
  const n = Object.is(raw, -0) ? 0 : raw;
  if (!isTr(locale)) {
    try { return n.toLocaleString(locale, { maximumFractionDigits: maxFractionDigits }); } catch { /* aşağıya düş */ }
  }
  const neg = n < 0;
  const abs = Math.abs(n);
  // toFixed 1e21 ve üstünü üstel biçimde döndürür ("1e+21"); o eşikten sonra
  // tam sayı basamakları BigInt ile açılır (oyun sayıları buraya gelmez —
  // bozuk bir sunucu değeri ekrana "1e+21" olarak düşmesin diye emniyet).
  let intPart: string;
  let frac = '';
  if (abs >= 1e21) {
    intPart = BigInt(Math.trunc(abs)).toString();
  } else {
    const [i, fracRaw] = abs.toFixed(maxFractionDigits).split('.');
    intPart = i!;
    frac = (fracRaw ?? '').replace(/0+$/, '');
  }
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '-' : ''}${grouped}${frac ? `,${frac}` : ''}`;
}

/**
 * 2026-09-03 → "3 Eyl 2026" (tr-TR). Başka dilde Intl kısa ay.
 * "YYYY-MM-DD" biçimi TAKVİM GÜNÜdür: JS onu UTC gece yarısı olarak ayrıştırır,
 * yerel getter'lar UTC'nin batısındaki saat dilimlerinde bir gün geri kayar
 * (2 Eyl gösterirdi). Bu yüzden yalnız-tarih girişinde UTC getter kullanılır;
 * zaman içeren girişler (ISO timestamp / Date) yerel saatte gösterilir.
 */
export function formatDate(input: Date | string | number, locale: string = activeLocale()): string {
  const dateOnly = typeof input === 'string' && DATE_ONLY.test(input);
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  if (!isTr(locale)) {
    try {
      return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', ...(dateOnly ? { timeZone: 'UTC' } : null) });
    } catch { /* aşağıya düş */ }
  }
  const day = dateOnly ? d.getUTCDate() : d.getDate();
  const month = dateOnly ? d.getUTCMonth() : d.getMonth();
  const year = dateOnly ? d.getUTCFullYear() : d.getFullYear();
  return `${day} ${TR_MONTHS_SHORT[month]} ${year}`;
}
