// Recompute name_norm for every club and player using the current normalize()
// rules. Run this after changing normalize.ts so stored data and query-time
// input stay consistent — no Wikidata re-fetch needed.
import { pool, closePool } from './pool.ts';
import { normalize } from '../game/normalize.ts';

async function renormalizeTable(table: 'clubs' | 'players'): Promise<number> {
  const { rows } = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM ${table}`,
  );
  let updated = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of rows) {
      const norm = normalize(r.name);
      const res = await client.query(
        `UPDATE ${table} SET name_norm = $2 WHERE id = $1 AND name_norm IS DISTINCT FROM $2`,
        [r.id, norm],
      );
      updated += res.rowCount ?? 0;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  console.log(`  ✓ ${table}: ${rows.length} scanned, ${updated} updated`);
  return updated;
}

async function run(): Promise<void> {
  console.log('Renormalizing name_norm...');
  await renormalizeTable('clubs');
  await renormalizeTable('players');
}

run()
  .catch((err) => {
    console.error('Renormalize failed:', err);
    process.exitCode = 1;
  })
  .finally(closePool);
