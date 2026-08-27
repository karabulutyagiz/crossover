import { mkdir, readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool, closePool } from './pool.ts';

// Oyun sunucusundaki migrate.ts ile aynı desen: schema.sql idempotent uygulanır,
// sonra migrations/ altındaki NNNN_*.sql dosyaları sırayla (bir kez) koşar.
// Ayrı migration tablosu kullanılır ki oyunun schema_migrations'ı ile karışmasın.

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, 'migrations');

async function ensureMigrationTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS growth_schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
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
    const already = await pool.query('SELECT 1 FROM growth_schema_migrations WHERE id=$1', [file]);
    if (already.rowCount) continue;
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO growth_schema_migrations(id) VALUES($1)', [file]);
      await pool.query('COMMIT');
      console.log(`✓ Growth migration applied: ${file}`);
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
  const applied = await applyVersionedMigrations();
  console.log(`✓ Growth schema applied. Versioned migrations: ${applied}.`);
}

migrate()
  .then(() => closePool())
  .catch(async (err) => {
    console.error('Growth migration failed:', err);
    await closePool();
    process.exit(1);
  });
