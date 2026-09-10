import pg from 'pg';
import { config } from '../config.ts';
import { log } from '../logger.ts';
import { indexedDatabaseUrl, playerNameIndexFloor } from './playerNameIndex.ts';

export const nameIndexFloor = playerNameIndexFloor(config.verifyMatchThreshold);
const requestedReadBudget = Number(process.env.FOOTBALL_DB_POOL_MAX ?? 8);
export const footballReadBudget = Math.max(0, Math.min(
  Math.floor(Number.isFinite(requestedReadBudget) ? requestedReadBudget : 8), config.dbPoolMax - 1));

// Single shared connection pool for the whole process.
export const pool = new pg.Pool({
  // Set once during connection startup, before the pool can lend the client.
  // No per-request SET/query race and no extra round trip per guess.
  connectionString: indexedDatabaseUrl(config.databaseUrl, nameIndexFloor),
  max: config.dbPoolMax - footballReadBudget,
  connectionTimeoutMillis: config.dbConnectionTimeoutMs,
  idleTimeoutMillis: config.dbIdleTimeoutMs,
});

pool.on('error', (err) => {
  log.error('pg_pool_error', { message: err.message, stack: err.stack });
});

// Reserve part of the SAME connection budget for public football reads. A burst
// of profile/settlement/telemetry work must not queue ahead of every answer read.
const readUrl = new URL(indexedDatabaseUrl(config.databaseUrl, nameIndexFloor));
readUrl.searchParams.set('options', `${readUrl.searchParams.get('options')} -c default_transaction_read_only=on`);
export const footballReadPool = footballReadBudget === 0 ? pool : new pg.Pool({
  connectionString: readUrl.href, max: footballReadBudget,
  allowExitOnIdle: true,
  connectionTimeoutMillis: config.dbConnectionTimeoutMs, idleTimeoutMillis: config.dbIdleTimeoutMs,
});
if (footballReadPool !== pool) footballReadPool.on('error', err => {
  log.error('football_read_pool_error', { message: err.message, stack: err.stack });
});

export async function closePool(): Promise<void> {
  await Promise.all([pool.end(), ...(footballReadPool !== pool ? [footballReadPool.end()] : [])]);
}
