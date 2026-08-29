// Username validation: format rules + a Turkish (and common English) profanity
// filter. Usernames are unique (enforced separately in the DB), one-time set.

// Normalize for profanity matching: lowercase, map Turkish letters and common
// leetspeak to ASCII, then strip everything but a-z0-9. This catches "s1kt1r",
// "0rospu", "a.m.k" etc.
function normalizeForFilter(s: string): string {
  return s
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/İ/g, 'i')
    .replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ç/g, 'c')
    .replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/[@4]/g, 'a').replace(/[0]/g, 'o').replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e').replace(/[5$]/g, 's').replace(/[7]/g, 't')
    .replace(/[^a-z0-9]/g, '');
}

// Offensive substrings (already normalized). Kept to clearly-offensive terms
// (mostly 4+ chars) to avoid false positives on innocent names.
const BANNED = [
  // Turkish
  'orospu', 'orspu', 'kahpe', 'pezevenk', 'pezeven', 'gavat', 'kavat',
  'amcik', 'amina', 'amini', 'aminako', 'amk', 'amq', 'awk',
  'sikis', 'sikim', 'sikik', 'siktir', 'sikeyim', 'sikerim', 'siktir',
  'yarrak', 'yarak', 'yarag', 'gotveren', 'gotver', 'gotten', 'ibne', 'ipne',
  'pust', 'pezo', 'kaltak', 'surtuk', 'oospu', 'piclik', 'piçlik',
  'ananisik', 'anasini', 'anani', 'bacini', 'sokarim', 'sokayim',
  'mal', // note: short; kept out below if false-positive prone
  'oc', 'pic',
  'tasak', 'tassak', 'cuk', 'amcuk', 'godo', 'godoş',
  // English
  'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'dick', 'pussy', 'nigger',
  'nigga', 'faggot', 'whore', 'slut', 'rape', 'nazi', 'hitler',
];
// Remove the most false-positive-prone short tokens; require them to be the
// whole name instead (handled below).
const SHORT_EXACT = new Set(['mal', 'oc', 'pic', 'am', 'got', 'sik', 'pust']);
const BANNED_SUBSTR = BANNED.filter((w) => !SHORT_EXACT.has(w));


// ── Otomatik düzeltme + biçim kuralları (kullanıcı kararı 2026-08-29) ────────
// Oyuncular Instagram alışkanlığıyla "Muhammed Taha Aksoy" gibi BOŞLUKLU ad
// yazıp hata alıyordu. Artık reddetmek yerine DÜZELTİYORUZ: boşluk ve nokta
// alt çizgiye döner, tekrarlar teke iner, baş/son alt çizgi kırpılır.
export const USERNAME_MIN = 4;   // 3 harf "njj" gibi anlamsız adlara kapı açıyordu
export const USERNAME_MAX = 20;  // "muhammed_taha_aksoy" (19) sığsın diye 16 → 20

const VOWELS = /[aeıioöuüAEIİOÖUÜ]/;

export function normalizeUsername(raw: string): string {
  return raw
    .trim()
    .replace(/[\s.\-]+/g, '_')      // boşluk / nokta / tire → alt çizgi
    .replace(/[^A-Za-z0-9_çğıöşüÇĞİÖŞÜ]/g, '') // kalan geçersiz karakterler atılır
    .replace(/_{2,}/g, '_')          // arka arkaya alt çizgi teke iner
    .replace(/^_+|_+$/g, '')         // baştaki/sondaki alt çizgi kırpılır
    .slice(0, USERNAME_MAX);
}

export interface UsernameCheck {
  ok: boolean;
  error?: string;
}

/**
 * Censor profanity in a message body. Works per WORD: if a word's normalized
 * form contains any banned term (or equals a short exact one), the ENTIRE word
 * is masked with asterisks. This means inflections/affixes are fully censored —
 * "siktirgit", "amklar", "fucking" all become "******…" — instead of leaving the
 * non-offensive remainder visible. Processing per word also avoids the old
 * normalized-index-to-original mapping bug (spaces/punctuation shifted offsets).
 */
export function censorMessage(text: string): string {
  return text.replace(/\S+/g, (word) => {
    const norm = normalizeForFilter(word);
    if (!norm) return word;
    // Short roots (≤4) match only at the word START so suffix inflections are
    // caught ("amklar", "fucking") without false-positiving on innocent words
    // that merely contain them mid-string ("akşamki", "küçücük", "grape").
    // Longer roots (≥5) are distinctive enough for a plain contains check.
    const offensive =
      SHORT_EXACT.has(norm) ||
      BANNED_SUBSTR.some((w) => (w.length <= 4 ? norm.startsWith(w) : norm.includes(w)));
    return offensive ? '*'.repeat(word.length) : word;
  });
}

export function validateUsername(raw: string): UsernameCheck {
  // Girdi ÖNCE düzeltilir (boşluklu ad reddedilmez, alt çizgiye çevrilir);
  // kurallar düzeltilmiş ad üzerinde işletilir.
  const name = normalizeUsername(raw);
  if (name.length < USERNAME_MIN) return { ok: false, error: `Kullanıcı adı en az ${USERNAME_MIN} karakter olmalı` };
  if (name.length > USERNAME_MAX) return { ok: false, error: `Kullanıcı adı en fazla ${USERNAME_MAX} karakter olabilir` };
  if (!/^[A-Za-z0-9_çğıöşüÇĞİÖŞÜ]+$/.test(name)) {
    return { ok: false, error: 'Sadece harf, rakam ve _ kullanılabilir' };
  }
  if (/^\d+$/.test(name)) return { ok: false, error: 'Sadece rakamlardan oluşamaz' };
  // ANLAMSIZ AD ELEMESİ (2026-08-29): "njj", "xzk" gibi sessiz yığınları ile
  // "aaaa" gibi tek harf tekrarları oyun ciddiyetini bozuyordu.
  if (!VOWELS.test(name)) return { ok: false, error: 'Kullanıcı adı en az bir sesli harf içermeli' };
  if (/(.)\1{2,}/.test(name)) return { ok: false, error: 'Aynı karakter üst üste 3 kez kullanılamaz' };

  const norm = normalizeForFilter(name);
  if (norm.length === 0) return { ok: false, error: 'Geçersiz kullanıcı adı' };
  if (SHORT_EXACT.has(norm)) return { ok: false, error: 'Bu kullanıcı adı uygun değil' };
  // Kısa küfür kökleri ad BAŞINDA da yakalanır ("sikko", "amcik1" gibi ekli
  // türevler eskiden sızıyordu — yalnız birebir eşitlik aranıyordu).
  for (const w of SHORT_EXACT) {
    if (norm.startsWith(w)) return { ok: false, error: 'Bu kullanıcı adı uygun değil' };
  }
  for (const w of BANNED_SUBSTR) {
    if (norm.includes(w)) return { ok: false, error: 'Bu kullanıcı adı uygun değil' };
  }
  return { ok: true };
}
