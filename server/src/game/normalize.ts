// Normalize names for fuzzy matching. Used identically at ingest time (stored
// as name_norm) and at query time (the user's guess), so comparisons are
// apples-to-apples regardless of casing, accents, or Turkish-specific letters.

const TURKISH_MAP: Record<string, string> = {
  ı: 'i',
  İ: 'i',
  ş: 's',
  Ş: 's',
  ğ: 'g',
  Ğ: 'g',
  ü: 'u',
  Ü: 'u',
  ö: 'o',
  Ö: 'o',
  ç: 'c',
  Ç: 'c',
};

// Combining marks left over after NFD decomposition (accents, cedillas, etc.).
const COMBINING_MARKS = /\p{M}/gu;

export function normalize(input: string): string {
  if (!input) return '';
  let s = input;
  // Map Turkish letters explicitly first (some have no NFD decomposition, e.g. "ı").
  s = s.replace(/[ıİşŞğĞüÜöÖçÇ]/g, (ch) => TURKISH_MAP[ch] ?? ch);
  // Strip remaining diacritics via Unicode decomposition.
  s = s.normalize('NFD').replace(COMBINING_MARKS, '');
  // Remove apostrophes and dots WITHOUT inserting a space, so common football
  // names stay intact: "Eto'o" -> "etoo", "N'Golo" -> "ngolo", "S.K." -> "sk".
  s = s.replace(/['’`´.]/g, '');
  // Lowercase, turn any remaining separators into spaces, collapse whitespace.
  s = s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}
