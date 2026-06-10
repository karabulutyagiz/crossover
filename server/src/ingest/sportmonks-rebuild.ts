// Full from-scratch rebuild of our player/club/career data from Sportmonks.
//
// Why: our original data came from Wikidata, which is stale (careers stop ~2016
// for many players) — e.g. Uğurcan Çakır was missing his Galatasaray move.
// Sportmonks' per-season statistics give accurate career club lists (verified:
// Uğurcan -> Galatasaray + Trabzonspor; Burak Yılmaz -> GS/FB/BJK/Trabzon/Lille).
//
// Strategy (single resumable pass):
//   - Page through /players?include=statistics.team;statistics.season (cursor based,
//     trial caps per_page at 25). Each player's statistics list yields the exact
//     clubs they played for, with season years.
//   - Keep only players with >=2 distinct non-national clubs (needed to be a
//     crossover answer). Build staging tables sm_clubs / sm_players / sm_player_clubs.
//   - Resumable: the pagination cursor is persisted in sm_state, so a restart
//     continues where it left off (the trial token / rate limits make this a
//     long-running job).
//
// This writes ONLY to sm_* staging tables. A separate swap step replaces the live
// tables once coverage is verified, so the running game is untouched meanwhile.
import 'dotenv/config';
import { pool, closePool } from '../db/pool.ts';
import { normalize } from '../game/normalize.ts';

const T = process.env.SPORTMONKS_TOKEN ?? '';
const B = 'https://api.sportmonks.com/v3/football';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let reqs = 0;

async function api(pathOrUrl: string): Promise<any> {
  const url = pathOrUrl.startsWith('http')
    ? (pathOrUrl.includes('api_token') ? pathOrUrl : `${pathOrUrl}&api_token=${T}`)
    : `${B}${pathOrUrl}${pathOrUrl.includes('?') ? '&' : '?'}api_token=${T}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    let r: Response;
    try {
      r = await fetch(url);
    } catch {
      await sleep(3000);
      continue;
    }
    if (r.status === 429) {
      await sleep(60000);
      continue;
    }
    if (!r.ok) {
      if (r.status >= 500) {
        await sleep(3000);
        continue;
      }
      throw new Error(`HTTP ${r.status} on ${pathOrUrl.slice(0, 80)}`);
    }
    reqs++;
    return r.json();
  }
  throw new Error('retries exhausted');
}

function yearOf(season: any): number | null {
  if (!season) return null;
  const m = String(season.name ?? '').match(/(\d{4})/);
  if (m) return Number(m[1]);
  if (season.starting_at) return Number(String(season.starting_at).slice(0, 4));
  return null;
}

async function setup(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sm_clubs (
      sm_id bigint PRIMARY KEY, name text, name_norm text, logo_url text, is_national boolean DEFAULT false
    );
    CREATE TABLE IF NOT EXISTS sm_players (
      sm_id bigint PRIMARY KEY, name text, name_norm text, image_url text
    );
    CREATE TABLE IF NOT EXISTS sm_player_clubs (
      player_sm bigint, club_sm bigint, start_year int, end_year int,
      PRIMARY KEY (player_sm, club_sm)
    );
    CREATE TABLE IF NOT EXISTS sm_state (k text PRIMARY KEY, v text);
  `);
}

async function getState(k: string): Promise<string | null> {
  const { rows } = await pool.query<{ v: string }>('SELECT v FROM sm_state WHERE k=$1', [k]);
  return rows[0]?.v ?? null;
}
async function setState(k: string, v: string | number): Promise<void> {
  await pool.query(
    'INSERT INTO sm_state(k,v) VALUES($1,$2) ON CONFLICT(k) DO UPDATE SET v=excluded.v',
    [k, String(v)],
  );
}

async function upsertClub(team: any): Promise<void> {
  await pool.query(
    `INSERT INTO sm_clubs(sm_id,name,name_norm,logo_url,is_national) VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(sm_id) DO UPDATE SET logo_url = COALESCE(sm_clubs.logo_url, excluded.logo_url)`,
    [team.id, team.name, normalize(team.name), team.image_path ?? null, team.type === 'national'],
  );
}

/** Returns true if the player was kept (>=2 distinct non-national clubs). */
async function processPlayer(p: any): Promise<boolean> {
  const stats = p.statistics ?? [];
  const byTeam = new Map<number, { team: any; years: number[] }>();
  for (const s of stats) {
    const t = s.team;
    if (!t?.id || !t?.name) continue;
    if (t.gender && t.gender !== 'male') continue; // skip women's teams
    const y = yearOf(s.season);
    if (!byTeam.has(t.id)) byTeam.set(t.id, { team: t, years: [] });
    if (y) byTeam.get(t.id)!.years.push(y);
  }
  const nonNational = [...byTeam.values()].filter((e) => e.team.type !== 'national');
  if (nonNational.length < 2) return false;

  const name =
    p.display_name || p.name || `${p.firstname ?? ''} ${p.lastname ?? ''}`.trim();
  if (!name) return false;

  await pool.query(
    `INSERT INTO sm_players(sm_id,name,name_norm,image_url) VALUES($1,$2,$3,$4)
     ON CONFLICT(sm_id) DO UPDATE SET name=excluded.name, name_norm=excluded.name_norm,
       image_url=COALESCE(sm_players.image_url, excluded.image_url)`,
    [p.id, name, normalize(name), p.image_path ?? null],
  );

  for (const { team, years } of byTeam.values()) {
    await upsertClub(team);
    const sy = years.length ? Math.min(...years) : null;
    const ey = years.length ? Math.max(...years) : null;
    await pool.query(
      `INSERT INTO sm_player_clubs(player_sm,club_sm,start_year,end_year) VALUES($1,$2,$3,$4)
       ON CONFLICT(player_sm,club_sm) DO UPDATE
         SET start_year = LEAST(COALESCE(sm_player_clubs.start_year, excluded.start_year), COALESCE(excluded.start_year, sm_player_clubs.start_year)),
             end_year   = GREATEST(COALESCE(sm_player_clubs.end_year, excluded.end_year), COALESCE(excluded.end_year, sm_player_clubs.end_year))`,
      [p.id, team.id, sy, ey],
    );
  }
  return true;
}

async function run(): Promise<void> {
  if (!T) {
    console.error('Missing SPORTMONKS_TOKEN in .env');
    process.exitCode = 1;
    return;
  }
  await setup();

  let url = await getState('cursor');
  if (!url) url = `/players?include=statistics.team;statistics.season&per_page=25`;
  let kept = Number((await getState('kept')) ?? 0);
  let seen = Number((await getState('seen')) ?? 0);

  console.log(`Sportmonks rebuild starting (seen=${seen}, kept=${kept})...`);
  let sinceLog = 0;
  while (true) {
    let data: any;
    try {
      data = await api(url);
    } catch (e) {
      console.warn('page error, retrying:', String(e));
      await sleep(5000);
      continue;
    }
    const arr = data.data ?? [];
    for (const p of arr) {
      seen++;
      try {
        if (await processPlayer(p)) kept++;
      } catch (e) {
        console.warn('player error', p?.id, String(e).slice(0, 120));
      }
    }
    await setState('kept', kept);
    await setState('seen', seen);

    sinceLog += arr.length;
    if (sinceLog >= 500) {
      console.log(`  seen ${seen}, kept ${kept}, reqs ${reqs}`);
      sinceLog = 0;
    }

    const np = data.pagination?.next_page;
    if (np) {
      await setState('cursor', np);
      url = np;
    } else {
      break;
    }
    await sleep(120);
  }

  console.log(`\n✓ DONE. seen=${seen}, kept=${kept}, requests=${reqs}`);
}

run()
  .catch((err) => {
    console.error('Sportmonks rebuild failed:', err);
    process.exitCode = 1;
  })
  .finally(closePool);
