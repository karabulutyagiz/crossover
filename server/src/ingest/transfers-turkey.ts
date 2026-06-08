// Fetch ALL historical transfers for every Turkish Süper Lig + TFF 1. Lig team
// via API-Football's /transfers?team={id} endpoint.
//
// SAFE matching: a player is only matched if they already exist in our DB
// AND they already have a spell at one of the clubs in the transfer chain.
// This prevents matching "Burak Yılmaz (Başakşehir)" to the famous
// "Burak Yılmaz (Galatasaray)" — they must share at least one club.
import { pool, closePool } from '../db/pool.ts';
import { normalize } from '../game/normalize.ts';

const KEY = process.env.API_FOOTBALL_KEY ?? '';
const HOST = 'v3.football.api-sports.io';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let requestCount = 0;

async function apiFetch(url: string): Promise<any> {
  requestCount++;
  const res = await fetch(url, { headers: { 'x-apisports-key': KEY } });
  if (res.status === 429) {
    console.warn('  Rate limited, waiting 60s...');
    await sleep(60000);
    const retry = await fetch(url, { headers: { 'x-apisports-key': KEY } });
    if (!retry.ok) throw new Error(`HTTP ${retry.status} after retry`);
    return retry.json();
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const TURKISH_TEAMS = [
  // Süper Lig 2023-24
  549, 564, 607, 611, 645, 996, 998, 1001, 1002, 1004,
  1005, 1007, 1010, 3563, 3573, 3575, 3578, 3589, 3601, 3603,
  // TFF 1. Lig 2023-24
  994, 997, 1009, 3564, 3566, 3569, 3574, 3577, 3583, 3584,
  3588, 3595, 3597, 3602, 3609, 3613, 6343, 7411,
  // Historical
  1003, 1008,
];

// Club name cache
const clubCache = new Map<string, number | null>();

async function resolveClub(apiName: string): Promise<number | null> {
  if (clubCache.has(apiName)) return clubCache.get(apiName)!;
  const norm = normalize(apiName);
  if (!norm) { clubCache.set(apiName, null); return null; }
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM clubs
      WHERE is_national = false
        AND (similarity(name_norm, $1) >= 0.3 OR name_norm LIKE '%' || $1 || '%')
      ORDER BY similarity(name_norm, $1) DESC,
               (SELECT count(*) FROM player_clubs pc WHERE pc.club_id = clubs.id) DESC
      LIMIT 1`,
    [norm],
  );
  const id = rows[0] ? Number(rows[0].id) : null;
  clubCache.set(apiName, id);
  return id;
}

/**
 * SAFE player matching: find a player by name who ALREADY has a spell at
 * one of the given club IDs. This prevents cross-contamination between
 * different players with the same name.
 */
async function resolvePlayerSafe(
  apiName: string,
  knownClubIds: number[],
): Promise<number | null> {
  const norm = normalize(apiName);
  if (!norm || knownClubIds.length === 0) return null;
  const { rows } = await pool.query<{ id: string }>(
    `SELECT p.id FROM players p
      WHERE word_similarity($1, p.name_norm) >= 0.35
        AND EXISTS (
          SELECT 1 FROM player_clubs pc
          WHERE pc.player_id = p.id AND pc.club_id = ANY($2::bigint[])
        )
      ORDER BY word_similarity($1, p.name_norm) DESC,
               (SELECT count(*) FROM player_clubs pc WHERE pc.player_id = p.id) DESC
      LIMIT 1`,
    [norm, knownClubIds],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

interface Transfer {
  date: string;
  teams: { in: { name: string }; out: { name: string } };
}

async function run(): Promise<void> {
  if (!KEY) {
    console.error('Missing API_FOOTBALL_KEY in .env');
    process.exitCode = 1;
    return;
  }

  console.log(`Fetching transfers for ${TURKISH_TEAMS.length} Turkish teams (safe matching)...`);
  let totalSpellsAdded = 0;
  let totalPlayersEnriched = 0;

  for (const teamId of TURKISH_TEAMS) {
    let response: any[];
    try {
      const data = await apiFetch(`https://${HOST}/transfers?team=${teamId}`);
      response = data.response ?? [];
    } catch (err) {
      console.warn(`  Team ${teamId} failed:`, String(err).slice(0, 100));
      await sleep(2000);
      continue;
    }

    let teamSpells = 0;
    let teamPlayers = 0;

    for (const entry of response) {
      const apiPlayerName: string = entry.player?.name ?? '';
      const transfers: Transfer[] = entry.transfers ?? [];
      if (!apiPlayerName || transfers.length === 0) continue;

      // Resolve all clubs in the transfer chain first
      const clubIds: number[] = [];
      const transferClubs: Array<{ inId: number | null; outId: number | null; year: number | null; endYear: number | null }> = [];

      for (let i = 0; i < transfers.length; i++) {
        const t = transfers[i]!;
        const inId = await resolveClub(t.teams.in.name);
        const outId = await resolveClub(t.teams.out.name);
        const year = t.date ? Number(t.date.split('-')[0]) : null;
        const nextT = transfers[i + 1];
        const endYear = nextT?.date ? Number(nextT.date.split('-')[0]) : null;

        if (inId) clubIds.push(inId);
        if (outId) clubIds.push(outId);
        transferClubs.push({ inId, outId, year, endYear });
      }

      if (clubIds.length === 0) continue;

      // SAFE: only match if player already has a spell at one of these clubs
      const playerId = await resolvePlayerSafe(apiPlayerName, [...new Set(clubIds)]);
      if (!playerId) continue;

      let playerAdded = false;
      for (const tc of transferClubs) {
        if (!tc.inId || !tc.year) continue;
        // Skip if start > end (impossible)
        if (tc.endYear !== null && tc.year > tc.endYear) continue;

        try {
          const { rowCount } = await pool.query(
            `INSERT INTO player_clubs (player_id, club_id, start_year, end_year)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (player_id, club_id, (COALESCE(start_year, -1))) DO NOTHING`,
            [playerId, tc.inId, tc.year, tc.endYear],
          );
          if (rowCount && rowCount > 0) {
            teamSpells++;
            playerAdded = true;
          }
        } catch {
          // FK violation — skip
        }
      }
      if (playerAdded) teamPlayers++;
    }

    totalSpellsAdded += teamSpells;
    totalPlayersEnriched += teamPlayers;
    console.log(`  Team ${teamId}: ${response.length} players, +${teamSpells} spells, ${teamPlayers} enriched`);
    await sleep(2000);
  }

  console.log(`\n✓ Done. ${totalPlayersEnriched} players enriched, ${totalSpellsAdded} new spells added.`);
  console.log(`  API requests used: ${requestCount}`);
}

run()
  .catch((err) => {
    console.error('Turkey transfer ingest failed:', err);
    process.exitCode = 1;
  })
  .finally(closePool);
