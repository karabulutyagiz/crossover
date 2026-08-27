// ---- Elmas defteri (diamond_ledger) ortak yazıcısı ----
// KURAL (2026-08-27): elması değiştiren HER yol buraya bir satır düşer — defter
// bakiyeyi baştan sona yeniden kurabilmelidir. Önceden yalnız kozmetik + IAP
// yazıyordu; güç/avatar/emote/CO Pass/günlük fırsat/reklam/arena/seviye
// claim'leri deftersizdi ve bakiye geçmişi kopuktu.
//
// Yazım best-effort'tur: mutasyonun kendisi atomik UPDATE ile zaten kesinleşti;
// defter satırı düşmezse ödül/harcama GERİ ALINMAZ, hata loglanır. Tablo yoksa
// (eski DB, 42P01) sessiz geçilir — special_power_audit ile aynı sözleşme.
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.ts';

export interface DiamondLedgerEntry {
  userId: string;
  /** + kazanç, − harcama */
  amount: number;
  /** Mutasyonun RETURNING'inden gelen güncel bakiye. */
  balanceAfter: number;
  reason: string;
  referenceId?: string | null;
  /** Doğal anahtarı olan olaylar (arena, seviye claim, günlük fırsat) onu verir;
   * tek atımlık satın almalar boş bırakır → rastgele anahtar üretilir. */
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

/** DAİMA pool'dan yazar — açık bir transaction'ın client'ı buraya VERİLMEZ:
 * başarısız bir INSERT o transaction'ı zehirler ve asıl mutasyonu geri aldırır.
 * amount 0 ise satır düşülmez (ör. elmassız claim). */
export function recordDiamondLedger(entry: DiamondLedgerEntry): Promise<void> {
  if (!Number.isFinite(entry.amount) || Math.round(entry.amount) === 0) return Promise.resolve();
  const amount = Math.round(entry.amount);
  const after = Math.max(0, Math.round(entry.balanceAfter));
  const before = Math.max(0, after - amount);
  const key = entry.idempotencyKey ?? `${entry.reason.toLowerCase()}:${entry.userId}:${randomUUID()}`;
  return pool.query(
    `INSERT INTO diamond_ledger (idempotency_key, user_id, amount, balance_before, balance_after, reason, reference_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [key, entry.userId, amount, before, after, entry.reason, entry.referenceId ?? null, JSON.stringify(entry.metadata ?? {})],
  ).then(() => undefined).catch((err: unknown) => {
    if ((err as { code?: string }).code !== '42P01') {
      console.error('[diamond_ledger] failed:', err instanceof Error ? err.message : err);
    }
  });
}
