// Run the tm-swap.sql atomic swap: replace live clubs/players/player_clubs
// with the verified Transfermarkt staging data (tm_* tables).
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, closePool } from '../db/pool.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = await readFile(join(__dirname, 'tm-swap.sql'), 'utf8');

console.log('Running tm-swap: replacing live tables with TM staging data...');
const result = await pool.query(sql);
// The last statement in tm-swap.sql is a SELECT summary — print it.
const summary = (result as any)?.rows?.[0] ?? (Array.isArray(result) ? result[result.length - 1]?.rows?.[0] : null);
if (summary) {
  console.log(`✓ Swap complete. clubs=${summary.clubs} players=${summary.players} spells=${summary.spells} logos=${summary.clubs_with_logo} photos=${summary.players_with_photo}`);
} else {
  console.log('✓ Swap complete.');
}

await closePool();
