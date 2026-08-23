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
  'com.crossover.diamonds.15000': 15000,
  'com.crossover.diamonds.50000': 50000,
};

// Social Pack entitlements are product-based: weekly = exact 7 x 24 hours,
// monthly = exact 1 calendar month from the purchase timestamp.
const SOCIAL_PACK_PRODUCTS = new Set<string>([
  'com.crossover.socialpack.weekly',
  'com.crossover.socialpack.monthly',
]);
const SOCIAL_PACK_WEEKLY_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

// CO Pass (Premium Level Road) bought with real money instead of diamonds.
// The road is SEASONAL (premium_road resets each month), so this is a CONSUMABLE
// the player can buy again next season — not a one-time non-consumable.
const COPASS_PRODUCT = 'com.crossover.copass';

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function addCalendarMonthsClamped(baseMs: number, months: number): number {
  const d = new Date(baseMs);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const targetMonthIndex = month + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const targetDay = Math.min(d.getUTCDate(), daysInMonth(targetYear, normalizedMonth));
  return Date.UTC(
    targetYear,
    normalizedMonth,
    targetDay,
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds(),
  );
}

function socialPackExpiryMs(productId: string, purchaseMs: number): number | null {
  if (!Number.isFinite(purchaseMs) || purchaseMs <= 0) return null;
  if (productId === 'com.crossover.socialpack.weekly') return purchaseMs + SOCIAL_PACK_WEEKLY_DURATION_MS;
  if (productId === 'com.crossover.socialpack.monthly') return addCalendarMonthsClamped(purchaseMs, 1);
  return null;
}

function txIso(ms: unknown): string | null {
  const n = Number(ms);
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : null;
}

function txText(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function txPriceMilliunits(tx: any): number | null {
  const n = Number(tx?.price);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

async function updateTransactionMetadata(transactionId: string, meta: readonly [string, string | null, number | null, string | null, string | null, string | null, string | null, string | null]): Promise<void> {
  await pool.query(
    `UPDATE processed_transactions SET
       environment = COALESCE($2, environment),
       purchase_date = COALESCE($3, purchase_date),
       price_milliunits = COALESCE(price_milliunits, $4),
       currency = COALESCE(currency, $5),
       storefront = COALESCE(storefront, $6),
       transaction_reason = COALESCE(transaction_reason, $7),
       transaction_type = COALESCE(transaction_type, $8),
       revocation_date = COALESCE(revocation_date, $9)
     WHERE transaction_id = $1`,
    [transactionId, ...meta],
  );
}

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
// Hangi doğrulayıcı çözdüyse ortam ODUR: prod doğrularsa Production, sandbox'a
// düşerse Sandbox. Bu, tx.environment alanı gelmese bile ortamı GÜVENİLİR verir
// (admin paneli sandbox alımları saymasın diye şart).
async function decodeTransaction(jws: string): Promise<{ tx: any; verifierEnv: string }> {
  if (prodVerifier) {
    try { return { tx: await prodVerifier.verifyAndDecodeTransaction(jws), verifierEnv: 'Production' }; } catch { /* try sandbox */ }
  }
  if (sandboxVerifier) {
    return { tx: await sandboxVerifier.verifyAndDecodeTransaction(jws), verifierEnv: 'Sandbox' };
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
  let verifierEnv = 'Production';
  try {
    const decoded = await decodeTransaction(jws);
    tx = decoded.tx;
    verifierEnv = decoded.verifierEnv;
  } catch {
    return { ok: false, error: 'Makbuz doğrulanamadı, tekrar dene' };
  }
  if (!tx || tx.bundleId !== BUNDLE_ID || !tx.productId || !tx.transactionId) {
    return { ok: false, error: 'Makbuz geçersiz' };
  }

  let granted = 0; // diamonds credited this call
  const pid = tx.productId;

  // Ortam (Production/Sandbox) + Apple'ın gerçek satın alma zamanı. Admin paneli
  // YALNIZ Production (gerçek para) alımları saysın diye kaydedilir: sandbox
  // (TestFlight/test) alımları da doğrulanıp buraya düşer, `environment` onları ayırır.
  const environment: string =
    typeof (tx as { environment?: unknown }).environment === 'string' && (tx as { environment: string }).environment
      ? (tx as { environment: string }).environment
      : verifierEnv;
  const purchaseIso = txIso(tx.purchaseDate);
  const txMeta = [
    environment,
    purchaseIso,
    txPriceMilliunits(tx),
    txText(tx.currency),
    txText(tx.storefront),
    txText(tx.transactionReason),
    txText(tx.type),
    txIso(tx.revocationDate),
  ] as const;

  // Diamonds (consumable) — credit once per transaction (idempotent via PK).
  const amount = DIAMOND_PRODUCTS[pid];
  if (amount) {
    const ins = await pool.query<{ inserted: boolean }>(
      `INSERT INTO processed_transactions (
         transaction_id, user_id, product_id, diamonds, environment, purchase_date,
         price_milliunits, currency, storefront, transaction_reason, transaction_type, revocation_date
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (transaction_id) DO NOTHING
       RETURNING TRUE AS inserted`,
      [tx.transactionId, userId, pid, amount, ...txMeta],
    );
    if (ins.rows[0]?.inserted) {
      await pool.query(`UPDATE users SET diamonds = diamonds + $2 WHERE id = $1`, [userId, amount]);
      granted += amount;
    } else {
      await updateTransactionMetadata(tx.transactionId, txMeta);
    }
  }

  // Social Pack — grant the exact duration for the purchased plan.
  if (SOCIAL_PACK_PRODUCTS.has(pid)) {
    // Record the sale so it is countable in the admin panel. Idempotent via the PK:
    // a re-delivered transaction never double-counts, while each renewal (a NEW
    // transactionId) is correctly counted as a fresh sale. diamonds=0 (no diamonds
    // granted here) — the row exists purely for sales accounting.
    await pool.query(
      `INSERT INTO processed_transactions (
         transaction_id, user_id, product_id, diamonds, environment, purchase_date,
         price_milliunits, currency, storefront, transaction_reason, transaction_type, revocation_date
       ) VALUES ($1, $2, $3, 0, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (transaction_id) DO UPDATE SET
         environment = COALESCE(processed_transactions.environment, EXCLUDED.environment),
         purchase_date = COALESCE(processed_transactions.purchase_date, EXCLUDED.purchase_date),
         price_milliunits = COALESCE(processed_transactions.price_milliunits, EXCLUDED.price_milliunits),
         currency = COALESCE(processed_transactions.currency, EXCLUDED.currency),
         storefront = COALESCE(processed_transactions.storefront, EXCLUDED.storefront),
         transaction_reason = COALESCE(processed_transactions.transaction_reason, EXCLUDED.transaction_reason),
         transaction_type = COALESCE(processed_transactions.transaction_type, EXCLUDED.transaction_type),
         revocation_date = COALESCE(processed_transactions.revocation_date, EXCLUDED.revocation_date)`,
      [tx.transactionId, userId, pid, ...txMeta],
    );
    const purchasedAt = Number(tx.purchaseDate ?? 0);
    const fallbackExpiry = Number(tx.expiresDate ?? 0);
    const base = purchasedAt > 0 ? purchasedAt : fallbackExpiry;
    const until = socialPackExpiryMs(pid, base);
    if (until && until > Date.now()) {
      await pool.query(`UPDATE users SET social_pack_until = $2 WHERE id = $1`, [userId, new Date(until).toISOString()]);
    }
  }

  // CO Pass — unlock the premium level road for the current season (idempotent).
  if (pid === COPASS_PRODUCT) {
    const ins = await pool.query<{ inserted: boolean }>(
      `INSERT INTO processed_transactions (
         transaction_id, user_id, product_id, diamonds, environment, purchase_date,
         price_milliunits, currency, storefront, transaction_reason, transaction_type, revocation_date
       ) VALUES ($1, $2, $3, 0, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (transaction_id) DO NOTHING
       RETURNING TRUE AS inserted`,
      [tx.transactionId, userId, pid, ...txMeta],
    );
    if (ins.rows[0]?.inserted) {
      await pool.query(`UPDATE users SET premium_road = TRUE WHERE id = $1`, [userId]);
    } else {
      await updateTransactionMetadata(tx.transactionId, txMeta);
    }
  }

  const profile = await getUser(userId);
  if (!profile) return { ok: false, error: 'Kullanıcı bulunamadı' };
  return { ok: true, profile, granted };
}
