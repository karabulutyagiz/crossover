// Run the tm-swap.sql atomic swap: replace live clubs/players/player_clubs
// with the verified Transfermarkt staging data (tm_* tables).
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, closePool } from '../db/pool.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = await readFile(join(__dirname, 'tm-swap.sql'), 'utf8');
const dryRun = process.argv.includes('--dry-run') || process.env.TM_SWAP_DRY_RUN === '1';

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number`);
  return Math.floor(n);
}

const minClubs = intEnv('TM_SWAP_MIN_CLUBS', 1000);
const minPlayers = intEnv('TM_SWAP_MIN_PLAYERS', 10_000);
const minSpells = intEnv('TM_SWAP_MIN_SPELLS', 20_000);
const allowShrink = process.env.TM_SWAP_ALLOW_SHRINK === '1';

async function requireStagingTables(): Promise<void> {
  const required = ['tm_clubs', 'tm_players', 'tm_player_clubs'];
  const { rows } = await pool.query<{ name: string }>(
    `SELECT name FROM unnest($1::text[]) AS t(name) WHERE to_regclass(name) IS NULL`,
    [required],
  );
  if (rows.length > 0) throw new Error(`Missing staging tables: ${rows.map((r) => r.name).join(', ')}`);
}

async function preflight(): Promise<void> {
  await requireStagingTables();
  const { rows } = await pool.query<{
    valid_clubs: string;
    valid_players: string;
    valid_spells: string;
    players_pending: string;
    orphan_player_refs: string;
    orphan_club_refs: string;
    live_clubs: string;
    live_players: string;
    live_spells: string;
  }>(`
    WITH valid_clubs AS (
      SELECT id FROM tm_clubs WHERE name IS NOT NULL AND name_norm IS NOT NULL AND name_norm <> ''
    ), valid_players AS (
      SELECT p.id FROM tm_players p
       WHERE p.name IS NOT NULL AND p.name_norm IS NOT NULL AND p.name_norm <> ''
         AND EXISTS (SELECT 1 FROM tm_player_clubs pc JOIN valid_clubs c ON c.id = pc.club_id WHERE pc.player_id = p.id)
    ), valid_spells AS (
      SELECT pc.player_id, pc.club_id FROM tm_player_clubs pc
      JOIN valid_players p ON p.id = pc.player_id
      JOIN valid_clubs c ON c.id = pc.club_id
    )
    SELECT
      (SELECT count(*) FROM valid_clubs) AS valid_clubs,
      (SELECT count(*) FROM valid_players) AS valid_players,
      (SELECT count(*) FROM valid_spells) AS valid_spells,
      (SELECT count(*) FROM tm_players WHERE COALESCE(done, false) = false) AS players_pending,
      (SELECT count(*) FROM tm_player_clubs pc LEFT JOIN tm_players p ON p.id = pc.player_id WHERE p.id IS NULL) AS orphan_player_refs,
      (SELECT count(*) FROM tm_player_clubs pc LEFT JOIN tm_clubs c ON c.id = pc.club_id WHERE c.id IS NULL) AS orphan_club_refs,
      (SELECT count(*) FROM clubs) AS live_clubs,
      (SELECT count(*) FROM players) AS live_players,
      (SELECT count(*) FROM player_clubs) AS live_spells
  `);
  const s = rows[0]!;
  const summary = {
    clubs: Number(s.valid_clubs),
    players: Number(s.valid_players),
    spells: Number(s.valid_spells),
    pending: Number(s.players_pending),
    orphanPlayerRefs: Number(s.orphan_player_refs),
    orphanClubRefs: Number(s.orphan_club_refs),
    liveClubs: Number(s.live_clubs),
    livePlayers: Number(s.live_players),
    liveSpells: Number(s.live_spells),
  };
  console.log(
    `Preflight: staging clubs=${summary.clubs} players=${summary.players} spells=${summary.spells} ` +
    `pending=${summary.pending} orphans=${summary.orphanPlayerRefs}/${summary.orphanClubRefs} ` +
    `live=${summary.liveClubs}/${summary.livePlayers}/${summary.liveSpells}`,
  );

  const failures: string[] = [];
  if (summary.clubs < minClubs) failures.push(`valid clubs ${summary.clubs} < TM_SWAP_MIN_CLUBS ${minClubs}`);
  if (summary.players < minPlayers) failures.push(`valid players ${summary.players} < TM_SWAP_MIN_PLAYERS ${minPlayers}`);
  if (summary.spells < minSpells) failures.push(`valid spells ${summary.spells} < TM_SWAP_MIN_SPELLS ${minSpells}`);
  if (summary.pending > 0) failures.push(`tm_players still has ${summary.pending} pending career rows`);
  if (summary.orphanPlayerRefs > 0) failures.push(`tm_player_clubs has ${summary.orphanPlayerRefs} missing player refs`);
  if (summary.orphanClubRefs > 0) failures.push(`tm_player_clubs has ${summary.orphanClubRefs} missing club refs`);
  if (!allowShrink && summary.livePlayers >= minPlayers && summary.players < Math.floor(summary.livePlayers * 0.7)) {
    failures.push(`projected players shrink from ${summary.livePlayers} to ${summary.players}; set TM_SWAP_ALLOW_SHRINK=1 only for an intentional rebuild`);
  }
  if (!allowShrink && summary.liveSpells >= minSpells && summary.spells < Math.floor(summary.liveSpells * 0.7)) {
    failures.push(`projected spells shrink from ${summary.liveSpells} to ${summary.spells}; set TM_SWAP_ALLOW_SHRINK=1 only for an intentional rebuild`);
  }
  if (failures.length > 0) throw new Error(`tm-swap preflight failed:\n- ${failures.join('\n- ')}`);
}

try {
  await preflight();
  if (dryRun) {
    console.log('✓ Dry run complete. Swap SQL was not executed.');
  } else {
    console.log('Running tm-swap: replacing live tables with TM staging data...');
    const result = await pool.query(sql);
    // The last statement in tm-swap.sql is a SELECT summary — print it.
    const summary = (result as any)?.rows?.[0] ?? (Array.isArray(result) ? result[result.length - 1]?.rows?.[0] : null);
    if (summary) {
      console.log(`✓ Swap complete. clubs=${summary.clubs} players=${summary.players} spells=${summary.spells} logos=${summary.clubs_with_logo} photos=${summary.players_with_photo}`);
    } else {
      console.log('✓ Swap complete.');
    }
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closePool();
}
