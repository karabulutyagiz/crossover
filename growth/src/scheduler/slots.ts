import { pickWeighted, type RandomSource, defaultRandom } from '../content/teams.ts';

// Scheduling Engine (bölüm 16): sabit tek saat yok. Başlangıçta deneysel
// slotlar; öğrenme döngüsü platform_metrics'ten slot ağırlıklarını güncelledikçe
// seçim o ağırlıklara kayar (BestPostingTime öğrenilir, hard-code edilmez).

export const EXPERIMENTAL_SLOTS = ['12:00', '15:00', '18:00', '20:00', '22:00'] as const;

// İstanbul UTC+3 (2016'dan beri sabit — DST yok).
const IST_OFFSET_MS = 3 * 60 * 60 * 1000;

export function pickSlot(
  slotWeights: Record<string, number>,
  rnd: RandomSource = defaultRandom,
): string {
  return pickWeighted([...EXPERIMENTAL_SLOTS], slotWeights, rnd);
}

/**
 * Verilen "HH:MM" slotunun bir SONRAKİ İstanbul-saati oluşumunu UTC Date olarak
 * döner (bugünkü saat geçtiyse yarın). Dakika bazında ±jitterMin sapma eklenir —
 * her gün saniyesi saniyesine aynı anda atan hesap organik görünmez.
 */
export function nextOccurrence(
  slot: string,
  now: Date = new Date(),
  jitterMin = 7,
  rnd: RandomSource = defaultRandom,
): Date {
  const [hh, mm] = slot.split(':').map(Number);
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const target = new Date(Date.UTC(
    istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate(), hh ?? 12, mm ?? 0, 0,
  ));
  let utcTarget = new Date(target.getTime() - IST_OFFSET_MS);
  if (utcTarget.getTime() <= now.getTime()) {
    utcTarget = new Date(utcTarget.getTime() + 24 * 60 * 60 * 1000);
  }
  const jitter = Math.round((rnd.next() * 2 - 1) * jitterMin) * 60 * 1000;
  return new Date(utcTarget.getTime() + jitter);
}
