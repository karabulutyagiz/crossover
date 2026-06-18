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
  const name = raw.trim();
  if (name.length < 3) return { ok: false, error: 'Kullanıcı adı en az 3 karakter olmalı' };
  if (name.length > 16) return { ok: false, error: 'Kullanıcı adı en fazla 16 karakter olabilir' };
  // Allowed: Turkish/Latin letters, digits, underscore. No spaces.
  if (!/^[A-Za-z0-9_çğıöşüÇĞİÖŞÜ]+$/.test(name)) {
    return { ok: false, error: 'Sadece harf, rakam ve _ kullanılabilir (boşluk yok)' };
  }
  if (/^\d+$/.test(name)) return { ok: false, error: 'Sadece rakamlardan oluşamaz' };

  const norm = normalizeForFilter(name);
  if (norm.length === 0) return { ok: false, error: 'Geçersiz kullanıcı adı' };
  if (SHORT_EXACT.has(norm)) return { ok: false, error: 'Bu kullanıcı adı uygun değil' };
  for (const w of BANNED_SUBSTR) {
    if (norm.includes(w)) return { ok: false, error: 'Bu kullanıcı adı uygun değil' };
  }
  return { ok: true };
}
