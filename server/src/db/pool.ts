import pg from 'pg';
import { config } from '../config.ts';
import { log } from '../logger.ts';

// Single shared connection pool for the whole process.
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
