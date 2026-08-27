// Skorlama fonksiyonları — hepsi saf ve deterministik (invariant testleri koşar).

// ── AudienceFitScore (bölüm 9) ───────────────────────────────────────────
// Ağırlıklar spec'ten: futbol %40, engagement %20, yaş uyumu %10,
// mobil oyun kesişimi %15, Türkiye %10, tanıtım dostluğu %5. Girdiler 0-1,
// çıktı 0-100.
export interface AudienceFitInput {
  footballRelevance: number;
  engagement: number;
  audienceAgeFit: number;
  mobileGamingOverlap: number;
  turkeyRelevance: number;
  promotionFriendliness: number;
}

export function audienceFitScore(input: AudienceFitInput): number {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const score =
    clamp(input.footballRelevance) * 40 +
    clamp(input.engagement) * 20 +
    clamp(input.audienceAgeFit) * 10 +
    clamp(input.mobileGamingOverlap) * 15 +
    clamp(input.turkeyRelevance) * 10 +
    clamp(input.promotionFriendliness) * 5;
  return Math.round(score * 10) / 10;
}

export function fitPriority(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score >= 75) return 'HIGH';
  if (score >= 50) return 'MEDIUM';
  return 'LOW';
}

// ── HookQualityScore (bölüm 13) ──────────────────────────────────────────
// Clickbait frenidir: kısa ve merak uyandıran hook iyi; abartılı büyük harf,
// aşırı ünlem, boş vaat kalıpları cezalandırılır. 0-1.
export function hookQualityScore(hook: string): number {
  const h = hook.trim();
  if (!h) return 0.3; // hook'suz düz soru: nötr-altı ama geçerli
  let score = 0.7;

  const len = h.length;
  if (len >= 12 && len <= 70) score += 0.15;
  else if (len > 120) score -= 0.2;

  if (h.includes('?') || h.includes('saniye') || /bil/i.test(h)) score += 0.1;

  const exclamations = (h.match(/!/g) ?? []).length;
  if (exclamations >= 2) score -= 0.15;

  const letters = h.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '');
  const upper = letters.replace(/[^A-ZÇĞİÖŞÜ]/g, '');
  if (letters.length > 8 && upper.length / letters.length > 0.6) score -= 0.2; // BAĞIRAN HOOK

  const spamPatterns = [/inanılmaz/i, /şok/i, /kaçırma/i, /hemen indir/i, /tıkla/i];
  for (const p of spamPatterns) if (p.test(h)) score -= 0.15;

  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}

// ── ContentScore (bölüm 22) ──────────────────────────────────────────────
// CTR %25, install dönüşümü %30, paylaşım %15, yorum %10, retention kalitesi %20.
// "Çok görüntülenip install getirmeyen içerik en iyi içerik değildir" — install
// dönüşümü tek başına en ağır bileşendir.
export interface ContentScoreInput {
  impressions: number;
  linkClicks: number;
  storeVisits: number;
  installs: number;
  shares: number;
  comments: number;
  activatedPlayers: number; // install sonrası >=1 maç oynayan
}

export function contentScore(m: ContentScoreInput): number {
  const safeDiv = (a: number, b: number) => (b > 0 ? a / b : 0);
  // Oranlar tipik organik aralıklara normalize edilir (ör. %5 CTR ≈ tam puan).
  const ctr = Math.min(1, safeDiv(m.linkClicks, m.impressions) / 0.05);
  const installConv = Math.min(1, safeDiv(m.installs, Math.max(m.linkClicks, m.storeVisits)) / 0.3);
  const shareRate = Math.min(1, safeDiv(m.shares, m.impressions) / 0.01);
  const commentRate = Math.min(1, safeDiv(m.comments, m.impressions) / 0.01);
  const retention = Math.min(1, safeDiv(m.activatedPlayers, m.installs) / 0.6);
  const score =
    ctr * 0.25 + installConv * 0.30 + shareRate * 0.15 + commentRate * 0.10 + retention * 0.20;
  return Math.round(score * 1000) / 1000; // 0-1
}
