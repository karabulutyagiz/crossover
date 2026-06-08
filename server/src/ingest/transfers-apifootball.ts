// Fill in missing career spells from API-Football's /transfers endpoint.
// Uses team squads to map API-Football player IDs to our Wikidata players,
// then fetches transfer history for players who have incomplete careers.
//
// Free tier: 100 requests/day. Run daily to gradually fill gaps.
import { pool, closePool } from '../db/pool.ts';
import { normalize } from '../game/normalize.ts';

const KEY = process.env.API_FOOTBALL_KEY ?? '';
const HOST = 'v3.football.api-sports.io';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Track requests to stay within daily limit
let requestCount = 0;
const MAX_REQUESTS = 90; // leave 10 buffer

async function apiFetch(url: string): Promise<any> {
  if (requestCount >= MAX_REQUESTS) throw new Error('Daily request limit reached');
  requestCount++;
  const res = await fetch(url, { headers: { 'x-apisports-key': KEY } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// API-Football team IDs for Süper Lig teams (priority)
const PRIORITY_TEAMS = [
  645,  // Galatasaray
  611,  // Fenerbahce
  549,  // Besiktas
  998,  // Trabzonspor
  564,  // Basaksehir
  607,  // Antalyaspor
  3563, // Konyaspor
  3574, // Sivasspor
  3561, // Kayserispor
  996,  // Alanyaspor
  1007, // Rizespor
  995,  // Kasimpasa
  3575, // Hatayspor
  3589, // Karagumruk
  3563, // Adana Demirspor
  1008, // Gaziantep FK
  1010, // Ankaragucu
  997,  // Genclerbirligi
  3603, // Samsunspor
  3574, // Giresunspor
  994,  // Goztepe
  1003, // Bursaspor
];

interface TransferEntry {
  date: string;
  teams: {
    in: { id: number; name: string };
    out: { id: number; name: string };
  };
}

/** Match an API-Football player name to our DB player by fuzzy name match. */
async function matchPlayer(apiName: string): Promise<number | null> {
  const norm = normalize(apiName);
  if (!norm) return null;
  const { rows } = await pool.query<{ id: string; sim: number }>(
    `SELECT id, word_similarity($1, name_norm) AS sim
       FROM players
      WHERE word_similarity($1, name_norm) >= 0.5
      ORDER BY sim DESC,
               (image_url IS NOT NULL) DESC,
               (SELECT count(*) FROM player_clubs pc WHERE pc.player_id = players.id) DESC
      LIMIT 1`,
    [norm],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

/** Match API-Football team name to our DB club. */
async function matchClub(apiName: string): Promise<number | null> {
  const norm = normalize(apiName);
  if (!norm) return null;
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM clubs
      WHERE is_national = false AND similarity(name_norm, $1) >= 0.3
      ORDER BY similarity(name_norm, $1) DESC,
               (SELECT count(*) FROM player_clubs pc WHERE pc.club_id = clubs.id) DESC
      LIMIT 1`,
    [norm],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

/** Convert transfer list to career spells (club + year ranges). */
function transfersToSpells(
  transfers: TransferEntry[],
): Array<{ clubId: number; apiClubName: string; startYear: number | null; endYear: number | null }> {
  // Sort by date ascending
  const sorted = [...transfers].sort((a, b) => a.date.localeCompare(b.date));
  const spells: Array<{ clubId: number; apiClubName: string; startYear: number | null; endYear: number | null }> = [];

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i]!;
    const startYear = t.date ? Number(t.date.split('-')[0]) : null;
    const nextTransfer = sorted[i + 1];
    const endYear = nextTransfer?.date ? Number(nextTransfer.date.split('-')[0]) : null;

    spells.push({
      clubId: t.teams.in.id,
      apiClubName: t.teams.in.name,
      startYear,
      endYear,
    });
  }
  return spells;
}

async function run(): Promise<void> {
  if (!KEY) {
    console.error('Missing API_FOOTBALL_KEY in .env');
    process.exitCode = 1;
    return;
  }

  console.log(`Fetching transfer data from API-Football (max ${MAX_REQUESTS} requests)...`);
  let playersUpdated = 0;
  let spellsAdded = 0;

  for (const teamId of PRIORITY_TEAMS) {
    if (requestCount >= MAX_REQUESTS) break;

    // Get squad
    let squad: Array<{ id: number; name: string }>;
    try {
      const data = await apiFetch(`https://${HOST}/players/squads?team=${teamId}`);
      squad = (data.response?.[0]?.players ?? []).map((p: any) => ({ id: p.id, name: p.name }));
    } catch (err) {
      console.warn(`  Squad ${teamId} failed:`, err);
      await sleep(1000);
      continue;
    }
    console.log(`  Team ${teamId}: ${squad.length} players in squad`);
    await sleep(2000);

    for (const apiPlayer of squad) {
      if (requestCount >= MAX_REQUESTS) break;

      // Match to our DB
      const ourPlayerId = await matchPlayer(apiPlayer.name);
      if (!ourPlayerId) continue;

      // Get transfers
      let transfers: TransferEntry[];
      try {
        const data = await apiFetch(`https://${HOST}/transfers?player=${apiPlayer.id}`);
        transfers = data.response?.[0]?.transfers ?? [];
      } catch (err) {
        if (String(err).includes('429')) {
          console.warn(`  Rate limited, waiting 60s...`);
          await sleep(60000);
          continue;
        }
        if (String(err).includes('limit')) break;
        continue;
      }

      if (transfers.length === 0) { await sleep(1500); continue; }

      // Convert to spells and upsert missing ones
      const spells = transfersToSpells(transfers);
      let added = 0;

      for (const spell of spells) {
        const clubId = await matchClub(spell.apiClubName);
        if (!clubId) continue;

        // Insert if not exists
        const { rowCount } = await pool.query(
          `INSERT INTO player_clubs (player_id, club_id, start_year, end_year)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (player_id, club_id, (COALESCE(start_year, -1))) DO NOTHING`,
          [ourPlayerId, clubId, spell.startYear, spell.endYear],
        );
        if (rowCount && rowCount > 0) added++;
      }

      if (added > 0) {
        playersUpdated++;
        spellsAdded += added;
        console.log(`    + ${apiPlayer.name}: ${added} new spells`);
      }
      await sleep(1500);
    }
    await sleep(2000);
  }

  console.log(`\n✓ Done. ${playersUpdated} players enriched, ${spellsAdded} new spells added.`);
  console.log(`  API requests used: ${requestCount}/${MAX_REQUESTS}`);
}

run()
  .catch((err) => {
    console.error('Transfer ingest failed:', err);
    process.exitCode = 1;
  })
  .finally(closePool);
