// Apple In-App Purchase (StoreKit) receipt validation + diamond granting.
//
// The app sends the StoreKit receipt after a successful purchase; we validate it
// directly with Apple (verifyReceipt) using the app-specific shared secret, then
// credit diamonds for any NEW (not-yet-processed) consumable transactions. The
// processed_transactions table makes granting idempotent — re-sending a receipt
// (or a receipt that accumulates past purchases) never double-credits.
import { pool } from '../db/pool.ts';
import { config } from '../config.ts';
import { getUser, type UserProfile } from './rank.ts';

// Server-authoritative product → diamonds map. Keep the IDs in sync with the app
// (DIAMOND_PACKS in app/src/screens.tsx) and the App Store Connect products.
const DIAMOND_PRODUCTS: Record<string, number> = {
  'com.crossover.diamonds.100': 100,
  'com.crossover.diamonds.500': 500,
  'com.crossover.diamonds.1200': 1200,
  'com.crossover.diamonds.5000': 5000,
};

const PROD_URL = 'https://buy.itunes.apple.com/verifyReceipt';
const SANDBOX_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';

interface AppleInApp { product_id: string; transaction_id: string; original_transaction_id?: string }
interface AppleResp { status: number; receipt?: { in_app?: AppleInApp[] }; latest_receipt_info?: AppleInApp[] }

async function verifyWithApple(receipt: string): Promise<AppleResp | null> {
  const body = JSON.stringify({
    'receipt-data': receipt,
    password: config.iapSharedSecret,
    'exclude-old-transactions': false,
  });
  const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body };
  try {
    let r = await fetch(PROD_URL, opts);
    let j = (await r.json()) as AppleResp;
    // 21007 = a sandbox receipt was sent to the production endpoint → retry sandbox.
    if (j.status === 21007) {
      r = await fetch(SANDBOX_URL, opts);
      j = (await r.json()) as AppleResp;
    }
    return j;
  } catch {
    return null;
  }
}

export async function verifyApplePurchase(
  userId: string,
  receipt: string,
): Promise<{ ok: true; profile: UserProfile; granted: number } | { ok: false; error: string }> {
  if (!userId) return { ok: false, error: 'Önce giriş yap' };
  if (!config.iapSharedSecret) return { ok: false, error: 'Satın alma şu an kapalı' };
  if (!receipt) return { ok: false, error: 'Makbuz bulunamadı' };

  const resp = await verifyWithApple(receipt);
  if (!resp) return { ok: false, error: 'Apple sunucusuna ulaşılamadı, tekrar dene' };
  if (resp.status !== 0) return { ok: false, error: `Makbuz geçersiz (kod ${resp.status})` };

  // Consider every transaction the receipt carries; idempotency handles duplicates.
  const items = [...(resp.latest_receipt_info ?? []), ...(resp.receipt?.in_app ?? [])];
  let granted = 0;
  const seen = new Set<string>();
  for (const it of items) {
    const amount = DIAMOND_PRODUCTS[it.product_id];
    const txnId = it.transaction_id;
    if (!amount || !txnId || seen.has(txnId)) continue;
    seen.add(txnId);
    const ins = await pool.query(
      `INSERT INTO processed_transactions (transaction_id, user_id, product_id, diamonds)
         VALUES ($1, $2, $3, $4)
       ON CONFLICT (transaction_id) DO NOTHING`,
      [txnId, userId, it.product_id, amount],
    );
    if (ins.rowCount && ins.rowCount > 0) {
      await pool.query(`UPDATE users SET diamonds = diamonds + $2 WHERE id = $1`, [userId, amount]);
      granted += amount;
    }
  }

  const profile = await getUser(userId);
  if (!profile) return { ok: false, error: 'Kullanıcı bulunamadı' };
  return { ok: true, profile, granted };
}
