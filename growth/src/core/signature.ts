import crypto from 'node:crypto';

// İçerik yorgunluğu (bölüm 11): iki savunma hattı.
//  1) content_signature — platform+takımlar+oyuncu+hook tipi+CTA+şablon
//     kombinasyonunun hash'i. Aynı imza son N günde varsa içerik üretilmez.
//  2) Metin benzerliği — normalize edilmiş gövde+hook üzerinde token Jaccard
//     benzerliği. Eşik (varsayılan 0.85) üstü duplicate sayılır. Harici embedding
//     servisi gerektirmeyen, deterministik bir "semantic similarity" vekilidir.

export interface SignatureInput {
  platform: string;
  teams: string[];
  player: string;
  hookType: string;
  ctaId: string;
  templateId: string;
}

export function contentSignature(input: SignatureInput): string {
  const teams = [...input.teams].map((t) => normalizeText(t)).sort().join('+');
  const parts = [
    input.platform,
    teams,
    normalizeText(input.player),
    input.hookType,
    input.ctaId,
    input.templateId,
  ].join('|');
  return crypto.createHash('sha256').update(parts).digest('hex');
}

// Türkçe karakterleri sadeleştirip küçük harfe indirir; noktalama atılır.
export function normalizeText(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/[çÇ]/g, 'c').replace(/[ğĞ]/g, 'g').replace(/[ıİiI]/g, 'i')
    .replace(/[öÖ]/g, 'o').replace(/[şŞ]/g, 's').replace(/[üÜ]/g, 'u')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(normalizeText(s).split(' ').filter((t) => t.length > 1));
}

/**
 * 0-1 arası benzerlik: max(Jaccard, containment). Sosyal post'lar kısadır;
 * saf Jaccard "Ortak futbolcu?" vs "Ortak futbolcu kim?" gibi bariz kopyaları
 * tek kelime farkla eşiğin altına düşürür. Containment (kesişim / küçük küme)
 * bir metnin diğerinin alt kümesi olduğu durumu yakalar.
 */
export function textSimilarity(a: string, b: string): number {
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  const jaccard = union === 0 ? 0 : inter / union;
  const containment = inter / Math.min(ta.size, tb.size);
  return Math.max(jaccard, containment);
}

/** Aday metin, geçmiş metinlerden herhangi birine eşikten fazla benziyor mu? */
export function isDuplicateText(
  candidate: string,
  history: readonly string[],
  threshold: number,
): boolean {
  return history.some((h) => textSimilarity(candidate, h) > threshold);
}
