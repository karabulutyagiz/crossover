// Broad club-logo coverage via API-Football.
//
// Free, keyless logo CDN: https://media.api-sports.io/football/teams/{id}.png
// The /teams endpoint returns every team of a league in ONE request (with that
// logo URL), so ~20 league requests cover thousands of clubs — well within the
// free tier's 100 requests/day.
//
// Setup:
//   1) Get a free key at https://dashboard.api-football.com (or via RapidAPI).
//   2) Put it in .env:  API_FOOTBALL_KEY=xxxx
//   3) npm run ingest:apilogos
//
// Names are matched to our Wikidata clubs by fuzzy (Turkish/accent-insensitive)
// similarity; only confident matches are updated.
import { pool, closePool } from '../db/pool.ts';
import { normalize } from '../game/normalize.ts';

const KEY = process.env.API_FOOTBALL_KEY ?? '';
const SEASON = Number(process.env.API_FOOTBALL_SEASON ?? '2023');
const HOST = 'v3.football.api-sports.io';
const MATCH_MIN = 0.6;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Major leagues (API-Football league IDs). Extend as needed.
const LEAGUES: Record<string, number> = {
  'Premier League': 39,
  Championship: 40,
  'La Liga': 140,
  'La Liga 2': 141,
  'Serie A': 135,
  'Serie B': 136,
  Bundesliga: 78,
  'Bundesliga 2': 79,
  'Ligue 1': 61,
  'Ligue 2': 62,
  Eredivisie: 88,
  'Primeira Liga': 94,
  'Süper Lig': 203,
  'TFF 1. Lig': 204,
  'Belgian Pro League': 144,
  'Scottish Premiership': 179,
  'Swiss Super League': 207,
  'Austrian Bundesliga': 218,
  'Greek Super League': 197,
  'Russian Premier League': 235,
  'Ukrainian Premier League': 333,
  MLS: 253,
  'Liga MX': 262,
  'Brazil Serie A': 71,
  'Brazil Serie B': 72,
  'Argentine Liga Profesional': 128,
  'Saudi Pro League': 307,
  // Extra coverage
  'League One': 41,
  'League Two': 42,
  'Scottish Championship': 180,
  'Liga Portugal 2': 95,
  'Danish Superliga': 119,
  'Eliteserien': 103,
  Allsvenskan: 113,
  Ekstraklasa: 106,
  'Czech First League': 345,
  'Croatian HNL': 210,
  'Serbian SuperLiga': 286,
  'Romanian Liga I': 283,
  'Colombian Primera A': 239,
  'Chilean Primera': 265,
  'Uruguayan Primera': 270,
  'J1 League': 98,
  'K League 1': 292,
  'Chinese Super League': 169,
  'A-League': 188,
  'Egyptian Premier League': 233,
  'Qatar Stars League': 305,
  'UAE Pro League': 301,
};

interface ApiTeam {
  name: string;
  logo: string;
  country: string | null;
}

async function fetchLeagueTeams(leagueId: number): Promise<ApiTeam[]> {
  const url = `https://${HOST}/teams?league=${leagueId}&season=${SEASON}`;
  const res = await fetch(url, { headers: { 'x-apisports-key': KEY } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as {
    errors?: unknown;
    response: Array<{ team: { name: string; logo: string; country?: string } }>;
  };
  if (json.errors && Object.keys(json.errors).length) {
    throw new Error(`API error: ${JSON.stringify(json.errors)}`);
  }
  return json.response.map((r) => ({ name: r.team.name, logo: r.team.logo, country: r.team.country ?? null }));
}

/** Best confident club match for an API team name, or null. */
async function matchClub(apiName: string): Promise<number | null> {
  const norm = normalize(apiName);
  if (!norm) return null;
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id, word_similarity($1, name_norm) AS ws,
            (SELECT count(*) FROM player_clubs pc WHERE pc.club_id = clubs.id) AS members
       FROM clubs
      WHERE is_national = false
        AND word_similarity($1, name_norm) >= $2
      ORDER BY ws DESC, members DESC
      LIMIT 1`,
    [norm, MATCH_MIN],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

async function run(): Promise<void> {
  if (!KEY) {
    console.error('Missing API_FOOTBALL_KEY in .env. Get a free key at https://dashboard.api-football.com');
    process.exitCode = 1;
    return;
  }
  console.log(`Fetching team logos for ${Object.keys(LEAGUES).length} leagues (season ${SEASON})...`);

  let matched = 0;
  let seen = 0;
  for (const [name, id] of Object.entries(LEAGUES)) {
    let teams: ApiTeam[];
    try {
      teams = await fetchLeagueTeams(id);
    } catch (err) {
      console.warn(`  ✗ ${name} (${id}): ${err}`);
      await sleep(1500);
      continue;
    }
    let hit = 0;
    for (const t of teams) {
      seen += 1;
      const clubId = await matchClub(t.name);
      if (clubId) {
        await pool.query(
          `UPDATE clubs SET logo_url = COALESCE($2, logo_url), country = COALESCE($3, country), league = $4 WHERE id = $1`,
          [clubId, t.logo || null, t.country, name],
        );
        matched += 1;
        hit += 1;
      }
    }
    console.log(`  ✓ ${name}: ${teams.length} teams, ${hit} matched`);
    await sleep(7000); // free tier limits requests/minute; stay well under it
  }
  console.log(`\n✓ Done. ${matched} clubs updated with logos (from ${seen} API teams).`);
}

run()
  .catch((err) => {
    console.error('API-Football logo ingest failed:', err);
    process.exitCode = 1;
  })
  .finally(closePool);
