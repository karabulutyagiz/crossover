/**
 * Set trophies and diamonds for a user by display name.
 *
 * Usage: npx tsx src/cli/set-user-stats.ts <displayName> <trophies> <diamonds>
 * Example: npx tsx src/cli/set-user-stats.ts bloodsucker 550 1000
 */
import { pool, closePool } from '../db/pool.ts';

async function main() {
  const [,, name, trophiesStr, diamondsStr] = process.argv;
  if (!name || !trophiesStr || !diamondsStr) {
    console.error('Usage: npx tsx src/cli/set-user-stats.ts <displayName> <trophies> <diamonds>');
    process.exit(1);
  }
  const trophies = Number(trophiesStr);
  const diamonds = Number(diamondsStr);

  const { rows } = await pool.query<{ id: string; display_name: string; trophies: number; diamonds: number }>(
    `SELECT id, display_name, trophies, diamonds FROM users WHERE LOWER(display_name) = LOWER($1)`,
    [name],
  );

  if (rows.length === 0) {
    console.error(`User "${name}" not found`);
    await closePool();
    process.exit(1);
  }

  const user = rows[0]!;
  console.log(`Found: ${user.display_name} (${user.id}) — current: ${user.trophies} trophies, ${user.diamonds} diamonds`);

  await pool.query('UPDATE users SET trophies = $2, diamonds = $3 WHERE id = $1', [user.id, trophies, diamonds]);
  console.log(`Updated: ${user.display_name} → ${trophies} trophies, ${diamonds} diamonds`);

  await closePool();
}

main().catch((err) => { console.error(err); process.exit(1); });
