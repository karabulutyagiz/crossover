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
import { googlePlayAccessToken } from '../storeVersions.ts';
import { config } from '../config.ts';
import { log } from '../logger.ts';

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

/** İLK ALIMA 2x rozeti: hesap daha önce hiç elmas paketi almadıysa true.
 * Mağaza kataloğuyla istemciye gider; gerçek katlama satın alma anında
 * verifyApplePurchase içinde (aynı koşulla) uygulanır. */
export async function firstDiamondDoubleAvailable(userId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM processed_transactions WHERE user_id = $1 AND product_id LIKE 'com.crossover.diamonds.%' LIMIT 1`,
    [userId],
  );
  return rows.length === 0;
}

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

/**
 * Mağazadan bağımsız, DOĞRULANMIŞ satın alma. Apple'ın JWS'i ve Google Play
 * API yanıtı bu şekle indirgenir; ödül mantığı (elmas, Sosyal Paket, CO Pass)
 * tek yerde yaşasın diye — iki mağaza için ayrı kopya bakım kabusu olurdu.
 */
export interface VerifiedPurchase {
  transactionId: string;      // idempotency anahtarı (processed_transactions PK)
  productId: string;
  environment: string;        // 'Production' | 'Sandbox'
  purchaseMs: number | null;
  expiresMs?: number | null;  // abonelikte mağazanın bildirdiği bitiş
  priceMilliunits: number | null;
  currency: string | null;
  storefront: string | null;
  transactionReason: string | null;
  transactionType: string | null;
  revocationMs?: number | null;
}

/** Doğrulanmış satın almayı hesaba işler; yatan elması döndürür. */
async function applyPurchaseGrant(userId: string, p: VerifiedPurchase): Promise<number> {
  let granted = 0; // diamonds credited this call
  const pid = p.productId;

  // Ortam (Production/Sandbox): admin paneli YALNIZ Production (gerçek para)
  // alımlarını gelire sayar; sandbox/test alımları da doğrulanıp buraya düşer
  // ama `environment` onları ayırır.
  const environment = p.environment;
  const txMeta = [
    environment,
    txIso(p.purchaseMs),
    p.priceMilliunits,
    p.currency,
    p.storefront,
    p.transactionReason,
    p.transactionType,
    p.revocationMs == null ? null : txIso(p.revocationMs),
  ] as const;

  // Diamonds (consumable) — credit once per transaction (idempotent via PK).
  const amount = DIAMOND_PRODUCTS[pid];
  if (amount) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ins = await client.query<{ inserted: boolean }>(
        `INSERT INTO processed_transactions (
           transaction_id, user_id, product_id, diamonds, environment, purchase_date,
           price_milliunits, currency, storefront, transaction_reason, transaction_type, revocation_date
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (transaction_id) DO NOTHING
         RETURNING TRUE AS inserted`,
        [p.transactionId, userId, pid, amount, ...txMeta],
      );
      if (ins.rows[0]?.inserted) {
        const before = await client.query<{ diamonds: number }>(`SELECT diamonds FROM users WHERE id = $1 FOR UPDATE`, [userId]);
        const balanceBefore = Number(before.rows[0]?.diamonds ?? 0);
        // İLK ALIMA 2x (2026-08-27): hesabın İLK elmas paketi çift yatar —
        // klasik ilk-ödeme dönüştürücüsü. Kendi satırımız az önce girildiği
        // için transaction_id hariç tutulur; kullanıcı satırı FOR UPDATE ile
        // kilitli olduğundan eşzamanlı iki "ilk alım" yarışamaz.
        const prior = await client.query(
          `SELECT 1 FROM processed_transactions
            WHERE user_id = $1 AND transaction_id <> $2 AND product_id LIKE 'com.crossover.diamonds.%'
            LIMIT 1`,
          [userId, p.transactionId],
        );
        const doubled = prior.rows.length === 0;
        const credit = doubled ? amount * 2 : amount;
        const balanceAfter = balanceBefore + credit;
        await client.query(`UPDATE users SET diamonds = $2 WHERE id = $1`, [userId, balanceAfter]);
        if (doubled) {
          // Kayıt gerçeği yansıtsın: bu işlemle fiilen yatan elmas.
          await client.query(`UPDATE processed_transactions SET diamonds = $2 WHERE transaction_id = $1`, [p.transactionId, credit]);
        }
        await client.query(
          `INSERT INTO diamond_ledger (idempotency_key, user_id, amount, balance_before, balance_after, reason, reference_id, metadata)
           VALUES ($1, $2, $3, $4, $5, 'IAP_PURCHASE', $6, $7::jsonb)
           ON CONFLICT (idempotency_key) DO NOTHING`,
          [`iap:${p.transactionId}`, userId, credit, balanceBefore, balanceAfter, pid, JSON.stringify({ environment, transactionId: p.transactionId, firstPurchaseDouble: doubled })],
        ).catch((err) => { if ((err as { code?: string }).code !== '42P01') throw err; });
        granted += credit;
      } else {
        await client.query(
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
          [p.transactionId, ...txMeta],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    } finally {
      client.release();
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
      [p.transactionId, userId, pid, ...txMeta],
    );
    // Bitiş: mağaza gerçek bitişi bildirdiyse ONU kullan (Google subscriptionsv2
    // expiryTime verir), yoksa satın alma anından plan süresiyle hesapla.
    const until = p.expiresMs && p.expiresMs > 0
      ? p.expiresMs
      : socialPackExpiryMs(pid, Number(p.purchaseMs ?? 0));
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
      [p.transactionId, userId, pid, ...txMeta],
    );
    if (ins.rows[0]?.inserted) {
      await pool.query(`UPDATE users SET premium_road = TRUE WHERE id = $1`, [userId]);
    } else {
      await updateTransactionMetadata(p.transactionId, txMeta);
    }
  }

  return granted;
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

  const environment: string =
    typeof (tx as { environment?: unknown }).environment === 'string' && (tx as { environment: string }).environment
      ? (tx as { environment: string }).environment
      : verifierEnv;
  const granted = await applyPurchaseGrant(userId, {
    transactionId: String(tx.transactionId),
    productId: String(tx.productId),
    environment,
    purchaseMs: tx.purchaseDate == null ? null : Number(tx.purchaseDate),
    expiresMs: tx.expiresDate == null ? null : Number(tx.expiresDate),
    priceMilliunits: txPriceMilliunits(tx),
    currency: txText(tx.currency),
    storefront: txText(tx.storefront),
    transactionReason: txText(tx.transactionReason),
    transactionType: txText(tx.type),
    revocationMs: tx.revocationDate == null ? null : Number(tx.revocationDate),
  });

  const profile = await getUser(userId);
  if (!profile) return { ok: false, error: 'Kullanıcı bulunamadı' };
  return { ok: true, profile, granted };
}

// ═══════════════════════════════════════════════════════════════════════════
// GOOGLE PLAY DOĞRULAMASI (2026-08-29)
//
// Android'de satın alma İMKÂNSIZDI: istemci yalnız Apple isteği kuruyor,
// sunucuda Google doğrulaması yoktu. Bu blok o boşluğu kapatır.
//
// İstemci purchaseToken'ı gönderir; token'ın gerçekten ödenmiş bir satın alma
// olduğunu Google Play Developer API'sine SORARAK doğrularız (istemciye asla
// güvenilmez). Doğrulanan satın alma Apple ile AYNI applyPurchaseGrant'tan
// geçer — elmas/paket/CO Pass mantığı tek yerde.
//
// Kimlik: storeVersions.ts'teki service account (androidpublisher scope'u).
// Kimlik yoksa satın alma reddedilir — sessizce elmas yatırmak yasak.
// ═══════════════════════════════════════════════════════════════════════════

/** Android ürünlerinin TR fiyatları (milibirim: ₺29,99 → 29990).
 *  Google satın alma yanıtında fiyat vermez; admin panelindeki gelir tablosu
 *  için mağaza fiyatını buradan yazarız. İstemci fiyatlarıyla AYNI kalmalı. */
const ANDROID_PRICE_MILLIUNITS_TRY: Record<string, number> = {
  'com.crossover.diamonds.100': 29_990,
  'com.crossover.diamonds.500': 79_990,
  'com.crossover.diamonds.1200': 149_990,
  'com.crossover.diamonds.5000': 449_990,
  'com.crossover.diamonds.15000': 999_990,
  'com.crossover.diamonds.50000': 2_499_990,
  'com.crossover.socialpack.weekly': 39_990,
  'com.crossover.socialpack.monthly': 79_990,
  'com.crossover.copass': 349_990,
};

/** Google doğrulaması yapılabilir mi (service account tanımlı mı)?
 *  İstemci bunu /monetization-config'ten okur: hazır DEĞİLSE Android'de satın
 *  alma hiç başlatılmaz — aksi halde para çekilir ama hak verilemezdi. */
export async function androidIapReady(): Promise<boolean> {
  const token = await googlePlayAccessToken().catch(() => null);
  return !!token;
}

async function googlePlayGet(path: string): Promise<Record<string, unknown> | null> {
  const token = await googlePlayAccessToken().catch(() => null);
  if (!token) return null;
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(config.storeVersionCheck.androidPackageName)}/${path}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) {
    log.warn('google_play_verify_http_error', { status: res.status, path });
    return null;
  }
  return await res.json() as Record<string, unknown>;
}

/**
 * Google Play satın almasını doğrular ve hesaba işler.
 * `productId` istemciden gelir ama YETKİ KAYNAĞI DEĞİLDİR: aboneliklerde
 * Google'ın döndürdüğü lineItem ürünü esas alınır, tek seferliklerde token
 * zaten yalnız o ürün için geçerlidir (yanlış ürün → 404 → reddedilir).
 */
export async function verifyGooglePurchase(
  userId: string,
  purchaseToken: string,
  productId: string,
  isSubscription: boolean,
): Promise<{ ok: true; profile: UserProfile; granted: number } | { ok: false; error: string }> {
  if (!userId) return { ok: false, error: 'Önce giriş yap' };
  if (!purchaseToken || !productId) return { ok: false, error: 'Makbuz bulunamadı' };

  let verified: VerifiedPurchase | null = null;

  if (isSubscription) {
    const data = await googlePlayGet(`purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`);
    if (!data) return { ok: false, error: 'Satın alma doğrulanamadı, tekrar dene' };
    // subscriptionState: ACTIVE / IN_GRACE_PERIOD dışındakiler hak vermez.
    const state = String(data.subscriptionState ?? '');
    if (state !== 'SUBSCRIPTION_STATE_ACTIVE' && state !== 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD') {
      return { ok: false, error: 'Abonelik aktif değil' };
    }
    const lineItems = Array.isArray(data.lineItems) ? data.lineItems as Record<string, unknown>[] : [];
    const item = lineItems[0] ?? {};
    // Ürün kimliği GOOGLE'DAN alınır — istemcinin gönderdiği değere güvenilmez.
    const storeProductId = typeof item.productId === 'string' ? item.productId : productId;
    const expiryIso = typeof item.expiryTime === 'string' ? item.expiryTime : null;
    const startIso = typeof data.startTime === 'string' ? data.startTime : null;
    // Yenilemede latestOrderId değişir → her dönem AYRI satır (satış sayımı doğru).
    const orderId = typeof data.latestOrderId === 'string' && data.latestOrderId
      ? data.latestOrderId
      : `gp-sub-${purchaseToken.slice(0, 40)}`;
    verified = {
      transactionId: orderId,
      productId: storeProductId,
      environment: data.testPurchase ? 'Sandbox' : 'Production',
      purchaseMs: startIso ? Date.parse(startIso) : Date.now(),
      expiresMs: expiryIso ? Date.parse(expiryIso) : null,
      priceMilliunits: ANDROID_PRICE_MILLIUNITS_TRY[storeProductId] ?? null,
      currency: 'TRY',
      storefront: typeof data.regionCode === 'string' ? data.regionCode : null,
      transactionReason: 'PURCHASE',
      transactionType: 'Auto-Renewable Subscription',
      revocationMs: null,
    };
  } else {
    const data = await googlePlayGet(`purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`);
    if (!data) return { ok: false, error: 'Satın alma doğrulanamadı, tekrar dene' };
    // purchaseState: 0 = satın alındı (1 = iptal, 2 = beklemede).
    if (Number(data.purchaseState ?? -1) !== 0) return { ok: false, error: 'Satın alma tamamlanmadı' };
    const orderId = typeof data.orderId === 'string' && data.orderId
      ? data.orderId
      : `gp-${purchaseToken.slice(0, 40)}`;
    verified = {
      transactionId: orderId,
      productId,
      // purchaseType 0 = test alımı (lisans testçisi) — gelire sayılmaz.
      environment: Number(data.purchaseType ?? -1) === 0 ? 'Sandbox' : 'Production',
      purchaseMs: data.purchaseTimeMillis ? Number(data.purchaseTimeMillis) : Date.now(),
      expiresMs: null,
      priceMilliunits: ANDROID_PRICE_MILLIUNITS_TRY[productId] ?? null,
      currency: 'TRY',
      storefront: typeof data.regionCode === 'string' ? data.regionCode : null,
      transactionReason: 'PURCHASE',
      transactionType: 'Consumable',
      revocationMs: null,
    };
  }

  const granted = await applyPurchaseGrant(userId, verified);
  const profile = await getUser(userId);
  if (!profile) return { ok: false, error: 'Kullanıcı bulunamadı' };
  log.info('google_purchase_verified', { userId, productId: verified.productId, granted, environment: verified.environment });
  return { ok: true, profile, granted };
}
