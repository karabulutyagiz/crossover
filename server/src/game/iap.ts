// Apple In-App Purchase validation (StoreKit 2 / react-native-iap v15).
//
// The app sends the per-transaction JWS (signed transaction) after a purchase. We verify
// the JWS signature against Apple's root CAs (offline, no shared secret / no verifyReceipt
// — that legacy endpoint is being retired), decode the transaction, and credit diamonds /
// extend the Social Pack. processed_transactions makes consumable grants idempotent, so a
// replayed transaction (StoreKit2 re-delivers unfinished ones) never double-credits.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SignedDataVerifier, Environment } from '@apple/app-store-server-library';
import { pool } from '../db/pool.ts';
import { getUser, type UserProfile } from './rank.ts';

const BUNDLE_ID = 'com.crossover.football';
const APP_APPLE_ID = 6778542426;

// Server-authoritative product → diamonds map. Keep in sync with the app (DIAMOND_PACKS)
// and the App Store Connect products.
const DIAMOND_PRODUCTS: Record<string, number> = {
  'com.crossover.diamonds.100': 100,
  'com.crossover.diamonds.500': 500,
  'com.crossover.diamonds.1200': 1200,
  'com.crossover.diamonds.5000': 5000,
};

// Auto-renewable subscriptions (the Social Pack) → set social_pack_until to the JWS expiry.
const SOCIAL_PACK_PRODUCTS = new Set<string>([
  'com.crossover.socialpack.weekly',
  'com.crossover.socialpack.monthly',
]);

// Apple root CAs (public certs) for JWS signature verification.
const __dirname = dirname(fileURLToPath(import.meta.url));
const certsDir = join(__dirname, '../../certs');
const appleRootCAs: Buffer[] = [];
for (const f of ['AppleRootCA-G3.cer', 'AppleRootCA-G2.cer', 'AppleComputerRootCertificate.cer']) {
  try { appleRootCAs.push(readFileSync(join(certsDir, f))); } catch { /* cert missing — skip */ }
}

function makeVerifier(env: Environment): SignedDataVerifier | null {
  try { return new SignedDataVerifier(appleRootCAs, false, env, BUNDLE_ID, APP_APPLE_ID); }
  catch { return null; }
}
const prodVerifier = makeVerifier(Environment.PRODUCTION);
const sandboxVerifier = makeVerifier(Environment.SANDBOX);

// Verify a signed transaction JWS. Try Production first; sandbox transactions fail there
// (environment mismatch) so fall back to the Sandbox verifier (replaces the old 21007 dance).
async function decodeTransaction(jws: string) {
  if (prodVerifier) {
    try { return await prodVerifier.verifyAndDecodeTransaction(jws); } catch { /* try sandbox */ }
  }
  if (sandboxVerifier) {
    return await sandboxVerifier.verifyAndDecodeTransaction(jws);
  }
  throw new Error('no verifier');
}

export async function verifyApplePurchase(
  userId: string,
  jws: string,
): Promise<{ ok: true; profile: UserProfile; granted: number } | { ok: false; error: string }> {
  if (!userId) return { ok: false, error: 'Önce giriş yap' };
  if (!jws) return { ok: false, error: 'Makbuz bulunamadı' };
  if (!appleRootCAs.length) return { ok: false, error: 'Satın alma şu an kapalı' };

  let tx;
  try {
    tx = await decodeTransaction(jws);
  } catch {
    return { ok: false, error: 'Makbuz doğrulanamadı, tekrar dene' };
  }
  if (!tx || tx.bundleId !== BUNDLE_ID || !tx.productId || !tx.transactionId) {
    return { ok: false, error: 'Makbuz geçersiz' };
  }

  let granted = 0; // diamonds credited this call
  const pid = tx.productId;

  // Diamonds (consumable) — credit once per transaction (idempotent via PK).
  const amount = DIAMOND_PRODUCTS[pid];
  if (amount) {
    const ins = await pool.query(
      `INSERT INTO processed_transactions (transaction_id, user_id, product_id, diamonds)
         VALUES ($1, $2, $3, $4)
       ON CONFLICT (transaction_id) DO NOTHING`,
      [tx.transactionId, userId, pid, amount],
    );
    if (ins.rowCount && ins.rowCount > 0) {
      await pool.query(`UPDATE users SET diamonds = diamonds + $2 WHERE id = $1`, [userId, amount]);
      granted += amount;
    }
  }

  // Social Pack (auto-renewable) — set entitlement to the transaction's expiry if future.
  if (SOCIAL_PACK_PRODUCTS.has(pid) && tx.expiresDate) {
    const e = Number(tx.expiresDate);
    if (e > Date.now()) {
      await pool.query(`UPDATE users SET social_pack_until = $2 WHERE id = $1`, [userId, new Date(e).toISOString()]);
    }
  }

  const profile = await getUser(userId);
  if (!profile) return { ok: false, error: 'Kullanıcı bulunamadı' };
  return { ok: true, profile, granted };
}
