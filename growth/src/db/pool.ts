import pg from 'pg';
import { config } from '../config.ts';
import { log } from '../logger.ts';

// Tek paylaşılan havuz. Oyunla aynı veritabanı ama ayrı süreç/ayrı havuz:
// growth iş yükü oyunun bağlantı bütçesini yiyemez (kendi max'ı var).
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: config.dbPoolMax,
  connectionTimeoutMillis: config.dbConnectionTimeoutMs,
  idleTimeoutMillis: config.dbIdleTimeoutMs,
});

pool.on('error', (err) => {
  log.error('pg_pool_error', { message: err.message, stack: err.stack });
});

export async function closePool(): Promise<void> {
  await pool.end();
}
