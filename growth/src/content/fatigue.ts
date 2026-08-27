import { pool } from '../db/pool.ts';
import { config } from '../config.ts';
import { isDuplicateText } from '../core/signature.ts';

// Content Fatigue Engine (bölüm 11) — DB tarafı.
// 1) İmza eşleşmesi: aynı content_signature son N günde varsa reddet.
// 2) Metin benzerliği: son N günün gövdeleriyle Jaccard > eşik ise reddet.

export interface FatigueVerdict {
  fresh: boolean;
  reason?: 'signature_repeat' | 'too_similar';
}

export async function checkFatigue(
  platform: string,
  signature: string,
  bodyText: string,
): Promise<FatigueVerdict> {
  const windowDays = config.fatigueWindowDays;

  const sig = await pool.query(
    `SELECT 1 FROM growth_content_items
      WHERE content_signature = $1
        AND status <> 'REJECTED'
        AND created_at > now() - ($2 || ' days')::interval
      LIMIT 1`,
    [signature, String(windowDays)],
  );
  if (sig.rowCount) return { fresh: false, reason: 'signature_repeat' };

  const { rows } = await pool.query<{ body: string; hook: string }>(
    `SELECT body, hook FROM growth_content_items
      WHERE platform = $1
        AND status <> 'REJECTED'
        AND created_at > now() - ($2 || ' days')::interval
      ORDER BY created_at DESC
      LIMIT 300`,
    [platform, String(windowDays)],
  );
  const history = rows.map((r) => `${r.hook} ${r.body}`);
  if (isDuplicateText(bodyText, history, config.similarityThreshold)) {
    return { fresh: false, reason: 'too_similar' };
  }
  return { fresh: true };
}
