import { pool } from '../db/pool.ts';
import { config } from '../config.ts';
import type { ProviderLimits } from '../core/types.ts';

// Rate limit katmanı (bölüm 17). Sayaçlar growth_published_posts'tan türetilir
// (ayrı sayaç tablosu drift edebilirdi); 429 backoff durumu
// growth_provider_rate_limits'te tutulur. Global emniyet tavanları provider
// limitlerinin ÜSTÜNE çıkılmasına asla izin vermez.

export interface RateVerdict {
  allowed: boolean;
  reason?: 'daily_cap' | 'hourly_cap' | 'min_interval' | 'backoff';
  retryAt?: Date;
}

export function effectiveLimits(provider: ProviderLimits): ProviderLimits {
  return {
    maxPostsPerDay: Math.min(provider.maxPostsPerDay, config.globalMaxPostsPerDay),
    maxPostsPerHour: provider.maxPostsPerHour,
    minIntervalMinutes: Math.max(provider.minIntervalMinutes, config.globalMinIntervalMinutes),
  };
}

export async function ensureLimitsRow(platform: string, provider: ProviderLimits): Promise<void> {
  const eff = effectiveLimits(provider);
  await pool.query(
    `INSERT INTO growth_provider_rate_limits (platform, max_per_day, max_per_hour, min_interval_minutes)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (platform) DO NOTHING`,
    [platform, eff.maxPostsPerDay, eff.maxPostsPerHour, eff.minIntervalMinutes],
  );
}

export async function checkRateLimit(platform: string): Promise<RateVerdict> {
  const { rows: limitRows } = await pool.query<{
    max_per_day: number; max_per_hour: number; min_interval_minutes: number; backoff_until: Date | null;
  }>(
    `SELECT max_per_day, max_per_hour, min_interval_minutes, backoff_until
       FROM growth_provider_rate_limits WHERE platform = $1`,
    [platform],
  );
  const limits = limitRows[0];
  if (!limits) return { allowed: true }; // ensureLimitsRow worker başlangıcında koşar

  if (limits.backoff_until && limits.backoff_until.getTime() > Date.now()) {
    return { allowed: false, reason: 'backoff', retryAt: limits.backoff_until };
  }

  const { rows } = await pool.query<{ day_count: string; hour_count: string; last_at: Date | null }>(
    `SELECT
       count(*) FILTER (WHERE published_at > now() - interval '24 hours') AS day_count,
       count(*) FILTER (WHERE published_at > now() - interval '1 hour')  AS hour_count,
       max(published_at) AS last_at
     FROM growth_published_posts WHERE platform = $1`,
    [platform],
  );
  const stats = rows[0]!;
  if (Number(stats.day_count) >= limits.max_per_day) {
    return { allowed: false, reason: 'daily_cap', retryAt: new Date(Date.now() + 6 * 60 * 60 * 1000) };
  }
  if (Number(stats.hour_count) >= limits.max_per_hour) {
    return { allowed: false, reason: 'hourly_cap', retryAt: new Date(Date.now() + 60 * 60 * 1000) };
  }
  if (stats.last_at) {
    const nextOk = stats.last_at.getTime() + limits.min_interval_minutes * 60 * 1000;
    if (nextOk > Date.now()) {
      return { allowed: false, reason: 'min_interval', retryAt: new Date(nextOk) };
    }
  }
  return { allowed: true };
}

// Exponential backoff + jitter (retry loop YASAK — bölüm 17).
// base 2dk, her seviyede x2, tavan 6 saat, %30'a kadar jitter.
export function backoffDelayMs(level: number, rnd: () => number = Math.random): number {
  const base = 2 * 60 * 1000;
  const capped = Math.min(base * 2 ** Math.max(0, level), 6 * 60 * 60 * 1000);
  const jitter = capped * 0.3 * rnd();
  return Math.round(capped + jitter);
}

export async function recordRateLimitHit(platform: string, retryAfterMs?: number): Promise<Date> {
  const { rows } = await pool.query<{ backoff_level: number }>(
    `SELECT backoff_level FROM growth_provider_rate_limits WHERE platform = $1`,
    [platform],
  );
  const level = (rows[0]?.backoff_level ?? 0) + 1;
  const delay = retryAfterMs != null && retryAfterMs > 0
    ? retryAfterMs + Math.round(retryAfterMs * 0.2 * Math.random())
    : backoffDelayMs(level);
  const until = new Date(Date.now() + delay);
  await pool.query(
    `UPDATE growth_provider_rate_limits
        SET backoff_level = $2, backoff_until = $3, updated_at = now()
      WHERE platform = $1`,
    [platform, level, until],
  );
  return until;
}

export async function resetBackoff(platform: string): Promise<void> {
  await pool.query(
    `UPDATE growth_provider_rate_limits
        SET backoff_level = 0, backoff_until = NULL, updated_at = now()
      WHERE platform = $1`,
    [platform],
  );
}
