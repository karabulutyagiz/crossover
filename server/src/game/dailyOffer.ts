// Kişiye özel Günlük Fırsat (2026-08-27) — 101 Plus / CR mağaza modeli.
// KURAL: fırsat SUNUCU-OTORİTER ve DETERMİNİSTİKTİR — (userId, 12 saatlik
// pencere) çifti aynı fırsatı üretir; istemci yalnız gösterir. Fiyat/duruş
// istemciden gelmez, satın alma anında sunucu yeniden hesaplar.
import { createHash } from 'node:crypto';
import { pool } from '../db/pool.ts';
import { cosmeticItem, featuredCosmetics } from './cosmetics.ts';
import { recordDiamondLedger } from './diamondLedger.ts';
import { POWER_PRICES, getUser, type UserProfile } from './rank.ts';

export const OFFER_WINDOW_MS = 12 * 60 * 60 * 1000;

export interface DailyOfferView {
  key: string;                 // `${windowIdx}:${slug}` — satın almada doğrulanır
  kind: 'cosmetic' | 'power_bundle';
  itemId: string;              // kozmetik id / güç id
  qty: number;
  originalPrice: number;       // 💎
  price: number;               // 💎 (indirimli)
  expiresAt: string;           // pencere sonu (ISO) — istemci sayacı buna kilitlenir
}

function rngFrom(seedText: string): () => number {
  // sha256 tabanlı deterministik akış — Math.random YASAK (pencere içinde sabitlik şart)
  let counter = 0;
  return () => {
    const h = createHash('sha256').update(`${seedText}:${counter++}`).digest();
    return h.readUInt32BE(0) / 0xffffffff;
  };
}

/** Cazip fiyat: 10'a yuvarla, tam yüzlük çıkarsa 10 düş (700 → 690, 800 → 790). */
function charmPrice(raw: number): number {
  const tens = Math.max(10, Math.round(raw / 10) * 10);
  return tens % 100 === 0 ? tens - 10 : tens;
}

export function currentOfferWindow(now = Date.now()): { idx: number; expiresAt: number } {
  const idx = Math.floor(now / OFFER_WINDOW_MS);
  return { idx, expiresAt: (idx + 1) * OFFER_WINDOW_MS };
}

/** (user, pencere) için deterministik fırsat. Sahip olunan kozmetik teklif edilmez. */
export function computeDailyOffer(profile: UserProfile, now = Date.now()): DailyOfferView {
  const { idx, expiresAt } = currentOfferWindow(now);
  const rnd = rngFrom(`${profile.id}:${idx}:cof-daily-offer`);
  const owned = new Set(profile.ownedCosmetics ?? []);
  // Havuz: YALNIZ bu haftanın mağaza vitrini, sahip olunmayanlar.
  // Vitrin dışı bir ürün fırsat olarak çıkarsa kullanıcı mağazaya gidip
  // bulamıyor — "Altın Çerçeve fırsatı ama mağazada yok" (2026-08-27).
  // Fırsat penceresi 12 saat ve vitrin Pazartesi 00:00 UTC'de dönüyor; ikisi
  // de aynı sınırlara oturduğu için bir pencere asla vitrin değişimine denk
  // gelmez (satın alma anındaki yeniden hesap da aynı vitrini görür).
  const cosmetics = featuredCosmetics(new Date(now)).filter((c) => !owned.has(c.id));
  const roll = rnd();
  // Sosyal Paket fırsat havuzunda YOK (2026-08-27) — o sabit popup'ın işi;
  // havuz yalnız kozmetik + güç paketi dağıtır.
  if (roll < 0.7 && cosmetics.length > 0) {
    const pick = cosmetics[Math.floor(rnd() * cosmetics.length)]!;
    const discount = 0.15 + rnd() * 0.15; // %15-30
    // Taban (30) İÇERİDE clamp'lenir: dışarıda uygulanınca ucuz bir kozmetikte
    // fiyatı orijinalin ÜSTÜNE itip "-%0" rozeti üretebiliyordu. Bu sıralamayla
    // fiyat her koşulda orijinalin altında kalır.
    const price = Math.min(pick.diamondPrice - 10, Math.max(30, charmPrice(pick.diamondPrice * (1 - discount))));
    return { key: `${idx}:c:${pick.id}`, kind: 'cosmetic', itemId: pick.id, qty: 1, originalPrice: pick.diamondPrice, price, expiresAt: new Date(expiresAt).toISOString() };
  }
  {
    const powers = ['xp2x', 'shield', 'streak', 'training'] as const;
    const p = powers[Math.floor(rnd() * powers.length)]!;
    const unit = POWER_PRICES[p];
    const qty = 3;
    const orig = unit * qty;
    // İNDİRİM DERİN OLMAK ZORUNDA (kullanıcı şikâyeti 2026-08-27): ~%25'lik
    // eski indirimle Kupa Kalkanı ×3, 750 yerine ~560 çıkıyordu — mağazadan
    // 2 tane almakla (500) neredeyse aynı, yani "fırsat" hiç değil.
    // KURAL: 3'lü paket mağazadaki 2 tekliden (2 × unit) DAİMA ucuz olacak.
    const price = Math.min(unit * 2 - 10, charmPrice(orig * (0.52 + rnd() * 0.08))); // ~%40-48
    return { key: `${idx}:p:${p}`, kind: 'power_bundle', itemId: p, qty, originalPrice: orig, price, expiresAt: new Date(expiresAt).toISOString() };
  }
}

/** Bu pencerede zaten alındı mı? */
export async function dailyOfferClaimed(userId: string, windowIdx: number): Promise<boolean> {
  const { rows } = await pool.query('SELECT 1 FROM daily_offer_claims WHERE user_id = $1 AND window_idx = $2', [userId, windowIdx]);
  return rows.length > 0;
}

export async function buyDailyOffer(
  userId: string,
  key: string,
): Promise<{ ok: true; profile: UserProfile; offer: DailyOfferView } | { ok: false; error: string }> {
  const user = await getUser(userId);
  if (!user) return { ok: false, error: 'Önce giriş yap' };
  const { idx } = currentOfferWindow();
  const offer = computeDailyOffer(user, Date.now());
  // İstemcinin gönderdiği key, sunucunun ŞU ANKİ penceresiyle birebir tutmalı —
  // pencere döndüyse eski fiyattan alınamaz.
  if (offer.key !== key) return { ok: false, error: 'Fırsatın süresi doldu' };
  if (await dailyOfferClaimed(userId, idx)) return { ok: false, error: 'Bu fırsatı zaten aldın' };

  const client = await pool.connect();
  let balanceAfter: number | null = null;
  try {
    await client.query('BEGIN');
    // pencere kilidi: aynı anda çift satın almayı PK engeller
    await client.query('INSERT INTO daily_offer_claims (user_id, window_idx) VALUES ($1, $2)', [userId, idx]);
    let updated;
    if (offer.kind === 'cosmetic') {
      const item = cosmeticItem(offer.itemId);
      if (!item) throw new Error('Ürün bulunamadı');
      updated = await client.query<{ id: string; diamonds: number }>(
        `UPDATE users SET diamonds = diamonds - $2, owned_cosmetics = array_append(owned_cosmetics, $3)
         WHERE id = $1 AND diamonds >= $2 AND NOT ($3 = ANY(owned_cosmetics)) RETURNING id, diamonds`,
        [userId, offer.price, offer.itemId],
      );
    } else {
      const col = offer.itemId === 'xp2x' ? 'power_xp2x' : offer.itemId === 'shield' ? 'power_shield' : offer.itemId === 'streak' ? 'power_streak' : 'power_training';
      updated = await client.query<{ id: string; diamonds: number }>(
        `UPDATE users SET diamonds = diamonds - $2, ${col} = ${col} + $3 WHERE id = $1 AND diamonds >= $2 RETURNING id, diamonds`,
        [userId, offer.price, offer.qty],
      );
    }
    if (!updated.rows[0]) { await client.query('ROLLBACK'); return { ok: false, error: 'Yeterli elmasın yok' }; }
    balanceAfter = Number(updated.rows[0].diamonds);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if ((err as { code?: string }).code === '23505') return { ok: false, error: 'Bu fırsatı zaten aldın' };
    throw err;
  } finally {
    client.release();
  }
  if (balanceAfter != null) {
    // Pencere indeksi doğal idempotency anahtarı: claim PK'sıyla birebir aynı
    // teklik — defter satırı da pencere başına en fazla bir kez düşer.
    void recordDiamondLedger({
      userId, amount: -offer.price, balanceAfter,
      reason: 'DAILY_OFFER_PURCHASE', referenceId: offer.key,
      idempotencyKey: `dailyoffer:${userId}:${idx}`,
      metadata: { kind: offer.kind, itemId: offer.itemId, qty: offer.qty },
    });
  }
  const fresh = await getUser(userId);
  if (!fresh) return { ok: false, error: 'Kullanıcı bulunamadı' };
  return { ok: true, profile: fresh, offer };
}
