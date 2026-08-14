import { mkdir, readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool, closePool } from './pool.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, 'migrations');

async function ensureMigrationTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function markBaseline(): Promise<void> {
  await pool.query(
    `INSERT INTO schema_migrations(id) VALUES($1) ON CONFLICT(id) DO NOTHING`,
    ['0000_schema_sql_baseline'],
  );
}

async function migrationFiles(): Promise<string[]> {
  await mkdir(migrationsDir, { recursive: true });
  const files = await readdir(migrationsDir);
  return files.filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
}

async function applyVersionedMigrations(): Promise<number> {
  const files = await migrationFiles();
  let applied = 0;
  for (const file of files) {
    const already = await pool.query('SELECT 1 FROM schema_migrations WHERE id=$1', [file]);
    if (already.rowCount) continue;
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO schema_migrations(id) VALUES($1)', [file]);
      await pool.query('COMMIT');
      console.log(`✓ Migration applied: ${file}`);
      applied += 1;
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }
  }
  return applied;
}

async function migrate(): Promise<void> {
  const sql = await readFile(join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  await ensureMigrationTable();
  await markBaseline();
  const applied = await applyVersionedMigrations();
  console.log(`✓ Schema applied (clubs, players, player_clubs, indexes). Versioned migrations applied: ${applied}.`);
}

migrate()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  })
  .finally(closePool);
