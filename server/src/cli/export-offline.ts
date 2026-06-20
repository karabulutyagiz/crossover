/**
 * Export a subset of the football database for the offline bot mode.
 *
 * Picks the top clubs by popularity (player count) PLUS the fixed bot-difficulty
 * pool teams (so the offline bot can pick from them), then exports every player
 * who crosses over between those clubs. Also resolves the difficulty pools to
 * concrete club ids and embeds them as `botPools` so the client doesn't have to
 * fuzzy-match names at runtime.
 *
 * Usage:  npx tsx src/cli/export-offline.ts
 * Output: ../app/src/offline/data.json
 */
import { pool, closePool } from '../db/pool.ts';
import { normalize } from '../game/normalize.ts';
import { BOT_POOLS } from '../game/botpools.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOP_CLUBS = 400;  // clubs with the most players
const MIN_SPELLS = 3;   // a player must have spells at ≥3 of these clubs

interface ExClub { id: number; name: string; norm: string; country: string | null; league: string | null; logo: string | null; }
interface ExPlayer { id: number; name: string; norm: string; nat: string | null; img: string | null; }
interface ExSpell { p: number; c: number; s: number | null; e: number | null; }

// Resolve a pool team's display/search name to the single best real club id.
async function resolveClub(query: string): Promise<{ id: number; name: string } | null> {
  const q = normalize(query);
  const { rows } = await pool.query<{ id: string; name: string }>(
    `SELECT c.id, c.name
       FROM clubs c
      WHERE c.is_national = false
        AND c.logo_url IS NOT NULL
        AND EXISTS (SELECT 1 FROM player_clubs pc WHERE pc.club_id = c.id)
        AND c.name_norm NOT LIKE '% b'
        AND c.name_norm NOT LIKE '%ii'
        AND c.name_norm NOT LIKE '%u21%'
        AND c.name_norm NOT LIKE '%u23%'
        AND c.name_norm NOT LIKE '%u19%'
        AND c.name_norm NOT LIKE '%u18%'
        AND c.name_norm NOT LIKE '%reserve%'
        AND c.name_norm NOT LIKE '% u-%'
        AND (c.name_norm = $1 OR c.name_norm % $1 OR c.name_norm LIKE '%' || $1 || '%')
      ORDER BY (c.name_norm = $1) DESC,
               (c.league IS NOT NULL) DESC,
               similarity(c.name_norm, $1) DESC,
               (SELECT COUNT(*) FROM player_clubs pc2 WHERE pc2.club_id = c.id) DESC,
               length(c.name) ASC
      LIMIT 1`,
    [q],
  );
  const r = rows[0];
  return r ? { id: Number(r.id), name: r.name } : null;
}

async function main() {
  // 1) Resolve the fixed difficulty pools to concrete club ids.
  console.log('Resolving bot pools...');
  const botPools: Record<'easy' | 'medium' | 'hard', number[]> = { easy: [], medium: [], hard: [] };
  const poolClubIds = new Set<number>();
  for (const level of ['easy', 'medium', 'hard'] as const) {
    for (const entry of BOT_POOLS[level]) {
      const r = await resolveClub(entry.q);
      if (r) {
        botPools[level].push(r.id);
        poolClubIds.add(r.id);
        const ok = normalize(r.name).includes(normalize(entry.name).slice(0, 4));
        console.log(`  ${level.padEnd(6)} ${entry.name.padEnd(22)} -> ${r.name}${ok ? '' : '   ⚠️ CHECK'}`);
      } else {
        console.log(`  ${level.padEnd(6)} ${entry.name.padEnd(22)} -> (NOT FOUND) ⚠️`);
      }
    }
  }

  // 2) Top clubs by player count.
  console.log('Querying top clubs...');
  const { rows: clubRows } = await pool.query<{
    id: string; name: string; name_norm: string; country: string | null; league: string | null; logo_url: string | null;
  }>(`
    SELECT c.id, c.name, c.name_norm, c.country, c.league, c.logo_url
    FROM clubs c JOIN player_clubs pc ON pc.club_id = c.id
    WHERE c.is_national = false
    GROUP BY c.id
    ORDER BY COUNT(DISTINCT pc.player_id) DESC
    LIMIT $1
  `, [TOP_CLUBS]);

  const clubIds = new Set<number>(clubRows.map(r => Number(r.id)));
  // Pull club rows for any pool club not already in the top set.
  const missingPool = [...poolClubIds].filter(id => !clubIds.has(id));
  let poolClubRows: typeof clubRows = [];
  if (missingPool.length) {
    const res = await pool.query<typeof clubRows[number]>(
      `SELECT id, name, name_norm, country, league, logo_url FROM clubs WHERE id = ANY($1)`,
      [missingPool],
    );
    poolClubRows = res.rows;
  }
  const allClubRows = [...clubRows, ...poolClubRows];
  const fullClubIds = new Set<number>(allClubRows.map(r => Number(r.id)));
  const clubs: ExClub[] = allClubRows.map(r => ({
    id: Number(r.id), name: r.name, norm: r.name_norm, country: r.country, league: r.league, logo: r.logo_url,
  }));
  console.log(`  ${clubs.length} clubs (${clubRows.length} top + ${poolClubRows.length} extra pool)`);

  // 3) Players: the existing top-club crossovers PLUS anyone who crosses over with
  //    a pool team (so HARD pool teams actually have answers offline).
  console.log('Querying players with crossover potential...');
  const top = [...clubIds];
  const full = [...fullClubIds];
  const poolArr = [...poolClubIds];
  const { rows: playerRows } = await pool.query<{
    id: string; name: string; name_norm: string; nationality: string | null; image_url: string | null;
  }>(`
    SELECT p.id, p.name, p.name_norm, p.nationality, p.image_url
    FROM players p
    WHERE (SELECT COUNT(DISTINCT pc.club_id) FROM player_clubs pc WHERE pc.player_id = p.id AND pc.club_id = ANY($1)) >= $2
       OR (
            (SELECT COUNT(DISTINCT pc.club_id) FROM player_clubs pc WHERE pc.player_id = p.id AND pc.club_id = ANY($3)) >= 1
        AND (SELECT COUNT(DISTINCT pc.club_id) FROM player_clubs pc WHERE pc.player_id = p.id AND pc.club_id = ANY($4)) >= 2
       )
  `, [top, MIN_SPELLS, poolArr, full]);

  const playerIds = new Set<number>(playerRows.map(r => Number(r.id)));
  const players: ExPlayer[] = playerRows.map(r => ({
    id: Number(r.id), name: r.name, norm: r.name_norm, nat: r.nationality, img: r.image_url,
  }));
  console.log(`  ${players.length} players`);

  console.log('Querying spells...');
  const { rows: spellRows } = await pool.query<{
    player_id: string; club_id: string; start_year: number | null; end_year: number | null;
  }>(`
    SELECT pc.player_id, pc.club_id, pc.start_year, pc.end_year
    FROM player_clubs pc
    WHERE pc.player_id = ANY($1) AND pc.club_id = ANY($2)
  `, [[...playerIds], full]);

  const spells: ExSpell[] = spellRows.map(r => ({
    p: Number(r.player_id), c: Number(r.club_id), s: r.start_year, e: r.end_year,
  }));
  console.log(`  ${spells.length} spells`);

  const data = { clubs, players, spells, botPools };
  const jsonStr = JSON.stringify(data);
  const sizeMB = (Buffer.byteLength(jsonStr) / 1024 / 1024).toFixed(1);

  const outArg = process.argv[2];
  const outPath = outArg
    ? path.resolve(outArg)
    : path.join(path.resolve(__dirname, '..', '..', '..', 'app', 'src', 'offline'), 'data.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, jsonStr);
  // Also write the small bot-pools file next to it (the client loads this cheaply
  // every launch, without parsing the multi-MB data.json).
  fs.writeFileSync(path.join(path.dirname(outPath), 'botpools.json'), JSON.stringify(botPools));

  console.log(`\nDone! ${outPath}`);
  console.log(`  ${clubs.length} clubs, ${players.length} players, ${spells.length} spells`);
  console.log(`  botPools: easy ${botPools.easy.length}, medium ${botPools.medium.length}, hard ${botPools.hard.length}`);
  console.log(`  File size: ${sizeMB} MB`);

  await closePool();
}

main().catch((err) => { console.error(err); process.exit(1); });
