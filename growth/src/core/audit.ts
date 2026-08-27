import { pool } from '../db/pool.ts';

// Audit log (bölüm 30): kim, ne zaman, neyi yayınladı/onayladı — hepsi kalıcı.
export async function audit(
  actor: string,
  action: string,
  entity?: string,
  entityId?: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await pool.query(
    `INSERT INTO growth_audit_logs (actor, action, entity, entity_id, detail)
     VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [actor, action, entity ?? null, entityId ?? null, JSON.stringify(detail)],
  );
}
