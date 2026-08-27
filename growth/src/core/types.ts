// Growth OS ortak tipleri. Provider'lar, içerik motoru ve worker bu sözleşme
// üzerinden konuşur — platform kodları birbirine sızmaz.

export type Platform =
  | 'x'
  | 'instagram'
  | 'telegram'
  | 'facebook'
  | 'reddit'
  | 'discord'
  | 'youtube'
  | 'eksisozluk'
  | 'threads'
  | 'tiktok';

export const ALL_PLATFORMS: readonly Platform[] = [
  'x', 'instagram', 'telegram', 'facebook', 'reddit',
  'discord', 'youtube', 'eksisozluk', 'threads', 'tiktok',
];

export type Pillar =
  | 'challenge'        // Football Challenge: "Chelsea + Real Madrid → ortak futbolcu?"
  | 'guess_path'       // Guess The Player: kariyer yolu
  | 'impossible'       // Impossible Challenge
  | 'derby'            // Derby içeriği
  | 'transfer'         // Güncel transferden soru
  | 'match_day'        // Maç günü içeriği
  | 'nostalgia'        // 2000-2010 nostaljisi
  | 'turkish_football' // Süper Lig odaklı
  | 'european_football'
  | 'competitive';     // "Arkadaşın senden önce bulabilir mi?"

export const ALL_PILLARS: readonly Pillar[] = [
  'challenge', 'guess_path', 'impossible', 'derby', 'transfer',
  'match_day', 'nostalgia', 'turkish_football', 'european_football', 'competitive',
];

export type HookType =
  | 'time_pressure'    // "5 saniyen var."
  | 'gatekeeping'      // "Bunu bilen gerçek futbol hastasıdır."
  | 'social_challenge' // "Arkadaşına gönder..."
  | 'stat_bait'        // "%90 burada yanlış cevap veriyor."
  | 'no_google'        // "Google yok."
  | 'direct_question'; // düz soru, hook'suz

export type ContentType = 'post' | 'reel' | 'image' | 'poll' | 'thread' | 'manual';

export type ScheduledStatus =
  | 'PENDING' | 'PROCESSING' | 'PUBLISHED' | 'FAILED'
  | 'REQUIRES_APPROVAL' | 'RETRY_SCHEDULED' | 'CANCELLED';

export type ContentStatus = 'DRAFT' | 'REQUIRES_APPROVAL' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';

export type PromotionPolicy = 'AUTO_POST_ALLOWED' | 'MANUAL_APPROVAL_REQUIRED' | 'DO_NOT_POST';

export type Role = 'ADMIN' | 'MARKETING' | 'VIEWER';

// Bölüm 33'teki structured output — üretici bu şekli döndürür, DB'ye bu yazılır.
export interface GeneratedContent {
  platform: Platform;
  contentType: ContentType;
  pillar: Pillar;
  hook: string;
  hookType: HookType;
  body: string;
  cta: string;
  ctaId: string;
  hashtags: string[];
  mediaBrief: MediaBrief | null;
  targetAudience: string;
  teams: string[];
  players: string[];
  footballContext: string;
  postingReason: string;
  suggestedTime: Date | null;
  riskScore: number;            // 0-1
  predictedEngagement: number;  // 0-1 (öğrenme durumundan tahmin)
  hookQualityScore: number;     // 0-1
  language: 'tr' | 'en';
  templateId: string;
}

// Bölüm 34: video/görsel üreticiye brief (ileride otomasyon pipeline'ına bağlanır).
export interface MediaBrief {
  format: '9:16' | '1:1' | '16:9';
  durationSec: number;
  scenes: { atSec: number; description: string; overlayText?: string }[];
}

export interface PublishInput {
  text: string;
  mediaUrl?: string;
  link?: string;
  idempotencyKey: string;
  target?: string; // kanal/chat id gibi hedef (owned kanallar)
  // Yorum/yanıt modu: X'te in_reply_to_tweet_id. Yalnızca comment-marketing
  // akışından gelir; normal içerik yayını bunu asla doldurmaz.
  replyToExternalId?: string;
}

export interface PublishResult {
  ok: boolean;
  externalId?: string;
  externalUrl?: string;
  // Yayın yapılamadıysa neden: not_configured -> manuel göreve düşer,
  // rate_limited -> backoff, invalid -> içerik reddi, error -> retry.
  failure?: 'not_configured' | 'rate_limited' | 'invalid' | 'error';
  retryAfterMs?: number;
  detail?: string;
}

export interface PostMetrics {
  impressions?: number;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  profileVisits?: number;
  linkClicks?: number;
  raw: Record<string, unknown>;
}

export interface ProviderLimits {
  maxPostsPerDay: number;
  maxPostsPerHour: number;
  minIntervalMinutes: number;
}

export interface PublishingCapabilities {
  canPublish: boolean;        // resmi API ile programatik yayın var mı
  contentTypes: ContentType[];
  requiresMediaUrl: boolean;  // IG gibi: medya public URL'den çekilir
  maxTextLength: number;
}
