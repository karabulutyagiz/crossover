// ============================================================================
// DAVET ÖDÜLÜ (2026-08-27) — "Arkadaşını getir, İKİNİZ de kazanın."
//
// Kurallar (farm'a karşı yapısal korumalar):
//  * Kod giren hesap KİMLİKLİ olmalı (Apple/Google/Facebook) ve ≤7 günlük —
//    misafir orduusuyla elmas basılamaz (arkadaşlık zaten kimlik ister).
//  * Davet eden de kimlikli olmalı; bir hesap kodu ömründe 1 kez girer
//    (referrals PK). Davet edenin ödülü günde en fazla REFERRER_DAILY_CAP kez
//    yatar — tavana takılsa bile kod giren ödülünü ALIR (yeni oyuncu asla
//    başkasının tavanına kurban gitmez) ve arkadaşlık yine kurulur.
//  * Her ödül elmas defterine idempotent yazılır.
// ============================================================================
import { pool } from '../db/pool.ts';
import { recordDiamondLedger } from './diamondLedger.ts';
import { getUser, resolveUserByCodeOrName, type UserProfile } from './rank.ts';

export const REFERRAL_REWARD = 100;
const REFERRER_DAILY_CAP = 10;
const MAX_ACCOUNT_AGE_MS = 7 * 24 * 3600_000;

export async function redeemReferral(
  userId: string,
  code: string,
): Promise<{ ok: true; profile: UserProfile; referrerName: string; reward: number } | { ok: false; error: string }> {
  if (!userId) return { ok: false, error: 'Önce giriş yap' };
  const trimmed = code.trim();
  if (!trimmed) return { ok: false, error: 'Davet kodu boş olamaz' };

  const referrer = await resolveUserByCodeOrName(trimmed);
  if (!referrer) return { ok: false, error: 'Bu davet koduyla bir oyuncu bulunamadı' };
  if (referrer.id === userId) return { ok: false, error: 'Kendi kodunu giremezsin :)' };

  const client = await pool.connect();
  let rewardReferred = 0;
  let rewardReferrer = 0;
  let referredBalance = 0;
  let referrerBalance: number | null = null;
  try {
    await client.query('BEGIN');
    const { rows: me } = await client.query<{ created_at: string; identified: boolean; diamonds: number }>(
      `SELECT created_at, (apple_sub IS NOT NULL OR google_sub IS NOT NULL OR facebook_sub IS NOT NULL) AS identified, diamonds
         FROM users WHERE id = $1 FOR UPDATE`,
      [userId],
    );
    const meRow = me[0];
    if (!meRow) { await client.query('ROLLBACK'); return { ok: false, error: 'Kullanıcı bulunamadı' }; }
    if (!meRow.identified) { await client.query('ROLLBACK'); return { ok: false, error: 'Davet ödülü için önce bir hesapla (Apple/Google) giriş yap' }; }
    if (Date.now() - new Date(meRow.created_at).getTime() > MAX_ACCOUNT_AGE_MS) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'Davet kodu yalnız yeni hesaplarda (ilk 7 gün) kullanılabilir' };
    }
    const { rows: ref } = await client.query<{ identified: boolean }>(
      `SELECT (apple_sub IS NOT NULL OR google_sub IS NOT NULL OR facebook_sub IS NOT NULL) AS identified FROM users WHERE id = $1`,
      [referrer.id],
    );
    if (!ref[0]?.identified) { await client.query('ROLLBACK'); return { ok: false, error: 'Bu davet kodu kullanılamıyor' }; }

    // Günlük tavan: davet edenin bugünkü ÖDÜLLÜ davet sayısı.
    const { rows: capRows } = await client.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM referrals
        WHERE referrer_id = $1 AND referrer_reward > 0 AND created_at >= date_trunc('day', now())`,
      [referrer.id],
    );
    rewardReferrer = Number(capRows[0]?.n ?? 0) < REFERRER_DAILY_CAP ? REFERRAL_REWARD : 0;
    rewardReferred = REFERRAL_REWARD;

    const ins = await client.query(
      `INSERT INTO referrals (referred_id, referrer_id, referred_reward, referrer_reward)
       VALUES ($1, $2, $3, $4) ON CONFLICT (referred_id) DO NOTHING RETURNING referred_id`,
      [userId, referrer.id, rewardReferred, rewardReferrer],
    );
    if (!ins.rows[0]) { await client.query('ROLLBACK'); return { ok: false, error: 'Bu hesapta bir davet kodu zaten kullanıldı' }; }

    const { rows: myBal } = await client.query<{ diamonds: number }>(
      `UPDATE users SET diamonds = diamonds + $2 WHERE id = $1 RETURNING diamonds`,
      [userId, rewardReferred],
    );
    referredBalance = Number(myBal[0]?.diamonds ?? 0);
    if (rewardReferrer > 0) {
      const { rows: refBal } = await client.query<{ diamonds: number }>(
        `UPDATE users SET diamonds = diamonds + $2 WHERE id = $1 RETURNING diamonds`,
        [referrer.id, rewardReferrer],
      );
      referrerBalance = Number(refBal[0]?.diamonds ?? 0);
    }
    // Otomatik arkadaşlık — iki yönlü satır (mevcut şema kuralı), yarışa dayanıklı.
    await client.query(
      `INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2), ($2, $1) ON CONFLICT DO NOTHING`,
      [userId, referrer.id],
    );
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }

  // Defter — tx DIŞI, idempotent (diamondLedger.ts sözleşmesi).
  void recordDiamondLedger({
    userId, amount: rewardReferred, balanceAfter: referredBalance,
    reason: 'REFERRAL_REWARD', referenceId: referrer.id,
    idempotencyKey: `referral:${userId}`,
  });
  if (rewardReferrer > 0 && referrerBalance != null) {
    void recordDiamondLedger({
      userId: referrer.id, amount: rewardReferrer, balanceAfter: referrerBalance,
      reason: 'REFERRAL_REFERRER_REWARD', referenceId: userId,
      idempotencyKey: `referralref:${userId}`,
    });
  }

  const fresh = await getUser(userId);
  if (!fresh) return { ok: false, error: 'Kullanıcı bulunamadı' };
  return { ok: true, profile: fresh, referrerName: referrer.display_name, reward: rewardReferred };
}
