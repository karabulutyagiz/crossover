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
    .replace(/[6]/g, 'g').replace(/[8]/g, 'b').replace(/[9]/g, 'g')
    .replace(/[^a-z0-9]/g, '');
}

// ── Yasaklı sözlük (2026-08-29 genişletildi) ────────────────────────────────
// Üç kovaya ayrılmıştır; ayrım YANLIŞ POZİTİFİ önlemek içindir:
//
//  EXACT_ONLY : yalnız adın TAMAMI buysa yasak. Masum kelimelerin içinde ya da
//               başında geçebilen kısa kökler buraya girer — "am" öneki
//               yasaklanırsa Amine/Amca/Amir/Amerika elenirdi.
//  PREFIX_ROOTS: ad BUNUNLA BAŞLIYORSA yasak. Ek almış türevleri yakalar
//               ("sikko", "amcik1", "orospucocugu").
//  CONTAINS   : nerede geçerse geçsin yasak. Yalnız ayırt edici, uzun (≥5)
//               köklerde kullanılır.
const EXACT_ONLY = new Set([
  'am', 'oc', 'mal', 'got', 'pic', 'pust', 'bok', 'sik', 'top', 'kro', 'gay',
]);

const PREFIX_ROOTS = [
  // Türkçe — ek alarak türeyenler
  'sik',  // önek: 'sikko' gibi türevleri de yakalar (birebir 'sik' zaten yasak)
  'amcik',
  'amina', 'amini', 'aminak', 'amk', 'amq', 'awk', 'aq', 'amcuk',
  'orospu', 'orspu', 'oruspu', 'orsp', 'oospu',
  'yarrak', 'yarak', 'yarag', 'yarra',
  'gotver', 'gotten', 'gotlek', 'gotos', 'gotur',
  'kahpe', 'kaltak', 'surtuk', 'kasar', 'fahise', 'yosma',
  'pezeven', 'pezo', 'gavat', 'kavat', 'ibne', 'ipne',
  'tasak', 'tassak', 'amcuk', 'godos', 'godo',
  'anani', 'ananin', 'anasini', 'anasin', 'bacini', 'bacin', 'babani',
  'sokarim', 'sokayim', 'kodum', 'koyim', 'koyum', 'koydum',
  'sicayim', 'sicarim', 'boktan', 'zikkim',
  'dallama', 'dangalak', 'gerizekali', 'salak', 'aptal', 'ahmak',
  'piclik', 'pezevenk', 'veledi',
  // İngilizce
  'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'dick', 'pussy', 'nigg',
  'faggot', 'whore', 'slut', 'rape', 'porn', 'penis', 'vagina', 'boob',
  'anal', 'cock', 'wank', 'bastard', 'retard', 'motherf',
];

const CONTAINS = [
  // Uzun ve ayırt edici — nerede geçerse geçsin
  'orospu', 'pezevenk', 'siktir', 'sikeyim', 'sikerim', 'gotveren',
  'amcik', 'amina', 'yarrak', 'kaltak', 'ananisik', 'anasini',
  'motherfuck', 'sonofabitch',
  // Nefret / aşırılık
  'nazi', 'hitler', 'isis',
];

// Rakamla maskelenen küfürler ("s2k", "s1k", "y4rrak"): normalleştirmeden sonra
// kalan rakamlar SESLİ HARF JOKERİ sayılıp tek tek denenir. Yalnız kısa ve
// rakam içeren adlarda çalışır — maliyeti önemsiz, kapsamı yüksek.
const VOWEL_JOKERS = ['a', 'e', 'i', 'o', 'u'];
function digitMaskedVariants(norm: string): string[] {
  if (!/[0-9]/.test(norm) || norm.length > 12) return [];
  const out: string[] = [];
  const idx = norm.search(/[0-9]/);
  // Rakam ya bir sesli harfin yerini tutuyordur ("s2k" → "sik") ya da araya
  // sıkıştırılmış gürültüdür ("am2k" → "amk"); iki ihtimal de denenir.
  const candidates = [...VOWEL_JOKERS.map((v) => norm.slice(0, idx) + v + norm.slice(idx + 1)),
                      norm.slice(0, idx) + norm.slice(idx + 1)];
  for (const c of candidates) {
    out.push(c);
    if (/[0-9]/.test(c)) out.push(...digitMaskedVariants(c));
  }
  return out;
}

/** Bir adın (normalleştirilmiş) yasaklı olup olmadığı — tek karar noktası. */
function isBannedNormalized(norm: string): boolean {
  if (!norm) return false;
  if (EXACT_ONLY.has(norm)) return true;
  if (PREFIX_ROOTS.some((w) => norm.startsWith(w))) return true;
  if (CONTAINS.some((w) => norm.includes(w))) return true;
  return false;
}

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
    const offensive = isBannedNormalized(norm) || digitMaskedVariants(norm).some(isBannedNormalized);
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
  // Rakamla maskelenen türevler de ("s2k" → "sik") aynı süzgeçten geçer.
  if (isBannedNormalized(norm) || digitMaskedVariants(norm).some(isBannedNormalized)) {
    return { ok: false, error: 'Bu kullanıcı adı uygun değil' };
  }
  return { ok: true };
}
