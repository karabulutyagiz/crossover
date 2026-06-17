/**
 * Export a subset of the football database for the offline bot mode.
 *
 * Picks the top ~500 clubs by popularity (player count), then exports every
 * player who has at least 2 club spells among those clubs (so they can appear
 * as "crossover" answers). Outputs a single JSON file that the React Native
 * app bundles as a static asset.
 *
 * Usage:  npx tsx src/cli/export-offline.ts
 * Output: ../app/src/offline/data.json
 */
import { pool, closePool } from '../db/pool.ts';
import { normalize } from '../game/normalize.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOP_CLUBS = 400;  // clubs with the most players
const MIN_SPELLS = 3;   // a player must have spells at ≥3 of these clubs

interface ExClub {
  id: number;
  name: string;
  norm: string;
  country: string | null;
  league: string | null;
  logo: string | null;
}

interface ExPlayer {
  id: number;
  name: string;
  norm: string;
  nat: string | null;   // nationality
  img: string | null;    // image_url
}

interface ExSpell {
  p: number;   // player_id
  c: number;   // club_id
  s: number | null;  // start_year
  e: number | null;  // end_year
}

async function main() {
  console.log('Querying top clubs...');
  const { rows: clubRows } = await pool.query<{
    id: string; name: string; name_norm: string; country: string | null;
    league: string | null; logo_url: string | null; player_count: string;
  }>(`
    SELECT c.id, c.name, c.name_norm, c.country, c.league, c.logo_url,
           COUNT(DISTINCT pc.player_id) AS player_count
    FROM clubs c
    JOIN player_clubs pc ON pc.club_id = c.id
    WHERE c.is_national = false
    GROUP BY c.id
    ORDER BY COUNT(DISTINCT pc.player_id) DESC
    LIMIT $1
  `, [TOP_CLUBS]);

  const clubIds = new Set(clubRows.map(r => Number(r.id)));
  const clubs: ExClub[] = clubRows.map(r => ({
    id: Number(r.id),
    name: r.name,
    norm: r.name_norm,
    country: r.country,
    league: r.league,
    logo: r.logo_url, // keep logos — they're short CDN URLs
  }));
  console.log(`  ${clubs.length} clubs`);

  console.log('Querying players with crossover potential...');
  // Players who played at ≥2 of these top clubs
  const clubIdArr = [...clubIds];
  const { rows: playerRows } = await pool.query<{
    id: string; name: string; name_norm: string; nationality: string | null; image_url: string | null;
  }>(`
    SELECT p.id, p.name, p.name_norm, p.nationality, p.image_url
    FROM players p
    WHERE (
      SELECT COUNT(DISTINCT pc.club_id)
      FROM player_clubs pc
      WHERE pc.player_id = p.id AND pc.club_id = ANY($1)
    ) >= $2
  `, [clubIdArr, MIN_SPELLS]);

  const playerIds = new Set(playerRows.map(r => Number(r.id)));
  const players: ExPlayer[] = playerRows.map(r => ({
    id: Number(r.id),
    name: r.name,
    norm: r.name_norm,
    nat: r.nationality,
    img: r.image_url,
  }));
  console.log(`  ${players.length} players`);

  console.log('Querying spells...');
  const { rows: spellRows } = await pool.query<{
    player_id: string; club_id: string; start_year: number | null; end_year: number | null;
  }>(`
    SELECT pc.player_id, pc.club_id, pc.start_year, pc.end_year
    FROM player_clubs pc
    WHERE pc.player_id = ANY($1) AND pc.club_id = ANY($2)
  `, [[...playerIds], clubIdArr]);

  const spells: ExSpell[] = spellRows.map(r => ({
    p: Number(r.player_id),
    c: Number(r.club_id),
    s: r.start_year,
    e: r.end_year,
  }));
  console.log(`  ${spells.length} spells`);

  const data = { clubs, players, spells };
  const jsonStr = JSON.stringify(data);
  const sizeMB = (Buffer.byteLength(jsonStr) / 1024 / 1024).toFixed(1);

  const outDir = path.resolve(__dirname, '..', '..', '..', 'app', 'src', 'offline');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'data.json');
  fs.writeFileSync(outPath, jsonStr);

  console.log(`\nDone! ${outPath}`);
  console.log(`  ${clubs.length} clubs, ${players.length} players, ${spells.length} spells`);
  console.log(`  File size: ${sizeMB} MB`);

  await closePool();
}

main().catch((err) => { console.error(err); process.exit(1); });
